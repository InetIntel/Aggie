'use strict';

const { Channel } = require('downstream');
const { TelegramClient } = require('telegram');
const { Logger } = require('telegram/extensions');
const { StringSession } = require('telegram/sessions');
const { decryptSecretsObject } = require('../utils/decryption');
const {
  deleteSocialAttachments,
  detectImageMimeType,
  persistSocialImage,
} = require('../utils/socialImageStorage');
const Source = require('../../models/source');

// supports comma-separated lists
function parseListsToEntities(lists) {
  if (!lists || typeof lists !== 'string') return [];
  return lists
    .split(/[\n,]+/)

    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalizeEntityLookupValue(value) {
  return String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

function getTelegramEntityIdentifier(input) {
  const value = String(input || '').trim();
  if (!value) return value;

  const urlValue = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(urlValue);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname !== 't.me' && hostname !== 'telegram.me') return value;

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'c' && segments[1]) {
      return `-100${segments[1]}`;
    }

    return segments[0] || value;
  } catch (_) {
    return value;
  }
}

function addEntityLookupCandidate(candidates, value) {
  const normalized = normalizeEntityLookupValue(value);
  if (normalized) candidates.add(normalized);
}

function getDialogLookupCandidates(dialog) {
  const candidates = new Set();
  const entity = dialog?.entity;

  addEntityLookupCandidate(candidates, dialog?.id?.toString?.());
  addEntityLookupCandidate(candidates, dialog?.title);
  addEntityLookupCandidate(candidates, dialog?.name);
  addEntityLookupCandidate(candidates, entity?.id?.toString?.());
  addEntityLookupCandidate(candidates, entity?.username);
  addEntityLookupCandidate(candidates, entity?.username ? `@${entity.username}` : '');

  if (entity?.id != null) {
    const id = String(entity.id);
    if (entity.className === 'Channel') addEntityLookupCandidate(candidates, `-100${id}`);
    if (entity.className === 'Chat') addEntityLookupCandidate(candidates, `-${id}`);
  }

  return candidates;
}

// extract first part of guid identifier, identify the chat/channel/user
function getPeerKey(message, entity) {
  const peer = message?.peerId;

  if (peer) {
    if (peer.channelId != null) return `channel:${String(peer.channelId)}`;
    if (peer.chatId != null) return `chat:${String(peer.chatId)}`;
    if (peer.userId != null) return `user:${String(peer.userId)}`;
  }

  return `entity:${String(entity)}`;
}

function getMessageDate(message) {
  return message?.date instanceof Date
    ? message.date
    : new Date(message.date * 1000);
}

function getTelegramGroupedId(message) {
  const groupedId = message?.groupedId;
  if (groupedId == null) return null;
  return groupedId?.toString?.() || String(groupedId);
}

function isTelegramPhotoMessage(message) {
  const media = message?.media;
  return media?.className === 'MessageMediaPhoto' && !!media?.photo;
}

function normalizeTelegramValue(value) {
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    return value.map((item) => normalizeTelegramValue(item));
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeTelegramValue(nestedValue),
      ])
    );
  }

  return value;
}

function getEntityDisplayName(entity) {
  if (!entity || typeof entity !== 'object') return '';

  if (entity.title) return entity.title;

  const fullName = [entity.firstName, entity.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName) return fullName;
  if (entity.username) return `@${entity.username}`;
  if (entity.id != null) return `id:${String(entity.id)}`;

  return '';
}

function getEntityHandle(entity) {
  if (entity?.username) return `@${entity.username}`;
  return '';
}

function getEntityUrl(entity) {
  if (entity?.username) return `https://t.me/${entity.username}`;
  return '';
}

function getChatKind(chat) {
  if (!chat || typeof chat !== 'object') return '';
  if (chat.broadcast) return 'channel';
  if (chat.megagroup || chat.className === 'Chat') return 'group';
  if (chat.className === 'User') return 'user';
  return '';
}

function formatTelegramAuthor({ chat, sender, postAuthor }) {
  const chatName = getEntityDisplayName(chat);
  const senderName = getEntityDisplayName(sender);
  const chatHandle = getEntityHandle(chat);
  const senderHandle = getEntityHandle(sender);
  const chatKind = getChatKind(chat);

  if (chatKind === 'channel' && chatName) {
    // return `${chatName} (channel)${chatHandle ? ` ${chatHandle}` : ''}`;
    return `${chatName} (channel)`;
  }

  if (chatKind === 'group' && chatName) {
    const groupLabel = `${chatName} (group)`;
    if (senderName) return `${groupLabel} ${senderName}`;
    if (postAuthor) return `${groupLabel} ${postAuthor}`;
    if (senderHandle) return `${groupLabel} ${senderHandle}`;


    return groupLabel;
  }

  if (chatKind === 'user') {
    if (senderName) return senderName;
    if (senderHandle) return senderHandle;
  }

  if (postAuthor) return postAuthor;
  if (chatName) return `${chatName}${chatKind ? ` (${chatKind})` : ''}${chatHandle ? ` ${chatHandle}` : ''}`;
  if (senderName) return senderName;
  if (senderHandle) return senderHandle;

  return '';
}

/**
 * A Channel that polls Telegram via User API (MTProto) using GramJS.
 * Requires credentials.secrets:
 *   - apiId
 *   - apiHash
 *   - sessionString
 *
 * options:
 *   - source: Source doc
 *   - credentials: Credentials doc
 *   - lists: string from Source.lists (entities to poll)
 *   - interval: polling interval ms
 */
class TelegramUserChannel extends Channel {
  #decryptedSecrets;
  #client;
  #timer;
  #dialogEntityCache;

  constructor(options) {
    super(options);

    if (!options.credentials) {
      throw new Error('The `credentials` field is required.');
    }

    if (!options.source) {
      throw new Error('The `source` field is required.');
    }

    this.source = options.source;
    this.credentials = options.credentials;

    this.#decryptedSecrets = this.credentials?.secrets
      ? decryptSecretsObject(this.credentials.secrets)
      : {};

    const { apiId, apiHash, sessionString } = this.#decryptedSecrets;
    if (!apiId || !apiHash || !sessionString) {
      throw new Error('Missing required secrets for telegramUser: apiId, apiHash, sessionString');
    }

    this.entities = parseListsToEntities(options.lists);
    // this.interval = Number(process.env.API_FETCH_INTERVAL ?? 300000);
    this.interval = Number(10000);
    this.#dialogEntityCache = null;

    // prevent overlapping polling cycles
    this._tickRunning = false;

    this.onTick = this.onTick.bind(this);
  }

  async start() {
    await super.start();

    const { apiId, apiHash, sessionString } = this.#decryptedSecrets;

    const session = new StringSession(sessionString);
    this.#client = new TelegramClient(session, Number(apiId), apiHash, {
      baseLogger: new Logger('none'),
      connectionRetries: 5,
    });

    await this.#client.connect();

    // run once immediately
    await this.onTick();

    // then poll periodically
    this.#timer = setInterval(() => {
      this.onTick().catch((err) => this.emit('error', err));
    }, this.interval);
  }

  async stop() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }

    if (this.#client) {
      try {
        await this.#client.disconnect();
      } catch (_) {}
      this.#client = null;
    }

    await super.stop();
  }

  async onTick() {
    if (this._tickRunning) return;
    this._tickRunning = true;

    try {
      if (!this.#client) return;
      if (!this.entities.length) return;

      const checkpoint = this.source.lastReportDate
        ? new Date(this.source.lastReportDate)
        : new Date(0);

      let maxAcceptedDate = null;

      for (const entity of this.entities) {
        try {
          const entityMaxDate = await this.pollEntity(entity, checkpoint);
          if (entityMaxDate && (!maxAcceptedDate || entityMaxDate > maxAcceptedDate)) {
            maxAcceptedDate = entityMaxDate;
          }
        } catch (err) {
          this.emit('error', this.normalizeTelegramError(err, entity));
        }
      }

      // update lastReportDate after the whole tick completes
      if (maxAcceptedDate) {
        await Source.findByIdAndUpdate(this.source._id, {
          $set: { lastReportDate: maxAcceptedDate }
        }).exec();

        this.source.lastReportDate = maxAcceptedDate;
      }
    } finally {
      this._tickRunning = false;
    }
  }

  // fetch message from one entity (channel/chat/group)
  async pollEntity(entity, checkpoint) {
    const limit = 100;
    const msgs = await this.getMessagesForEntity(entity, { limit });

    const fresh = msgs
      .filter((m) => {
        if (!m?.date) return false;
        return getMessageDate(m) > checkpoint;
      })
      .sort((a, b) => {
        const dateDelta = getMessageDate(a) - getMessageDate(b);
        if (dateDelta !== 0) return dateDelta;
        return Number(a.id || 0) - Number(b.id || 0);
      });

    if (!fresh.length) return null;

    let entityMaxDate = null;

    for (const group of this.groupFreshMessages(fresh)) {
      try {
        const item = group.groupedId
          ? await this.parseGroupedMessages(group.messages, {
              entity,
              groupedId: group.groupedId,
            })
          : await this.parse(group.messages[0], { entity });

        if (item != null) {
          this.enqueue(item);

          const messageDate = group.messages.reduce((latest, message) => {
            const currentDate = getMessageDate(message);
            return currentDate > latest ? currentDate : latest;
          }, getMessageDate(group.messages[0]));

          if (!entityMaxDate || messageDate > entityMaxDate) {
            entityMaxDate = messageDate;
          }
        }
      } catch (err) {
        this.emit('error', this.normalizeTelegramError(err, entity));
      }
    }

    return entityMaxDate;
  }

  async getDialogEntityCache() {
    if (this.#dialogEntityCache) return this.#dialogEntityCache;

    const dialogs = await this.#client.getDialogs({ limit: 500 });
    const lookup = new Map();

    for (const dialog of dialogs) {
      for (const candidate of getDialogLookupCandidates(dialog)) {
        if (!lookup.has(candidate)) {
          lookup.set(candidate, dialog.inputEntity || dialog.entity || dialog);
        }
      }
    }

    this.#dialogEntityCache = lookup;
    return lookup;
  }

  async resolveEntity(entity) {
    const identifier = getTelegramEntityIdentifier(entity);

    try {
      return await this.#client.getInputEntity(identifier);
    } catch (directError) {
      const lookup = await this.getDialogEntityCache();
      const resolved = lookup.get(normalizeEntityLookupValue(identifier));

      if (resolved) return resolved;

      directError.message = `Unable to resolve Telegram entity "${entity}". For private groups/channels, the logged-in account must already be a member and the source should use the dialog id, -100 channel id, exact title, or username. ${directError.message}`;
      throw directError;
    }
  }

  async getMessagesForEntity(entity, options) {
    const resolvedEntity = await this.resolveEntity(entity);
    return this.#client.getMessages(resolvedEntity, options);
  }

  groupFreshMessages(messages) {
    const groups = [];
    const groupedIndexes = new Map();

    for (const message of messages) {
      const groupedId = getTelegramGroupedId(message);

      if (!groupedId) {
        groups.push({ groupedId: null, messages: [message] });
        continue;
      }

      if (!groupedIndexes.has(groupedId)) {
        groupedIndexes.set(groupedId, groups.length);
        groups.push({ groupedId, messages: [] });
      }

      groups[groupedIndexes.get(groupedId)].messages.push(message);
    }

    return groups;
  }

  normalizeTelegramError(err, entity) {
    const e = err instanceof Error ? err : new Error(String(err));
    e.message = `[Fetching - telegramUser] entity=${entity} ${e.message}`;

    const msg = String(e.message);
    const m = msg.match(/FLOOD_WAIT_(\d+)/);
    if (m) {
      const waitSec = Number(m[1]);
      e.message = `[Fetching - telegramUser] entity=${entity} FLOOD_WAIT_${waitSec}`;
    }

    return e;
  }

  async parse(message, { entity }) {
    const text = message?.message || '';
    const media = message?.media;
    const isPhoto = isTelegramPhotoMessage(message);

    if (!text && !isPhoto) return;
    if (media && !isPhoto) return;

    const now = new Date();

    const messageDate = getMessageDate(message);
    const authoredAt = messageDate.toISOString();

    let sender = message.sender;
    let chat = message.chat;

    if (!sender && typeof message.getSender === 'function') {
      sender = await message.getSender().catch(() => undefined);
    }

    if (!chat && typeof message.getChat === 'function') {
      chat = await message.getChat().catch(() => undefined);
    }

    const senderHandle = getEntityHandle(sender);
    const chatHandle = getEntityHandle(chat);
    const senderUrl = getEntityUrl(sender);
    const chatUrl = getEntityUrl(chat);
    const author =
      formatTelegramAuthor({
        chat,
        sender,
        postAuthor: message.postAuthor,
      }) || (message.senderId ? `sender:${message.senderId}` : `entity:${entity}`);

    const platformID = String(message.id);
    const url = senderUrl || chatUrl || '';

    // build guid = peerKey + message.id, telegram message.id is unique only within specific chat, not globally.
    const peerKey = getPeerKey(message, entity);
    const guid = `${peerKey}:${String(message.id)}`;
    const attachments = isPhoto
      ? [await this.downloadPhotoAttachment(message)]
      : undefined;

    return {
      authoredAt,
      fetchedAt: now,
      author,
      content: text || '[photo]',
      url,
      platform: 'telegramUser',
      platformID,
      guid,
      attachments,
      raw: normalizeTelegramValue({
        entity,
        id: message.id,
        date: message.date,
        message: message.message,
        postAuthor: message.postAuthor,
        hasPhoto: isPhoto,
        senderId: message.senderId,
        sender: sender
          ? {
              id: sender.id,
              username: sender.username,
              title: sender.title,
              firstName: sender.firstName,
              lastName: sender.lastName,
            }
          : null,
        peerId: message.peerId,
        chat: chat
          ? {
              id: chat.id,
              username: chat.username,
              title: chat.title,
              firstName: chat.firstName,
              lastName: chat.lastName,
            }
          : null,
        peerKey, 
        senderHandle,
        senderUrl,
        chatHandle,
        chatUrl,
      }),
    };
  }

  async parseGroupedMessages(messages, { entity, groupedId }) {
    if (!Array.isArray(messages) || !messages.length) return;

    const hasUnsupportedMedia = messages.some((message) => {
      return message?.media && !isTelegramPhotoMessage(message);
    });

    if (hasUnsupportedMedia) return;

    const photoMessages = messages.filter(isTelegramPhotoMessage);
    if (!photoMessages.length) return;

    const captionMessage =
      messages.find((message) => (message?.message || '').trim()) ||
      photoMessages[0];

    const text = captionMessage?.message || '';
    const now = new Date();
    const authoredAt = getMessageDate(captionMessage).toISOString();

    let sender = captionMessage.sender;
    let chat = captionMessage.chat;

    if (!sender && typeof captionMessage.getSender === 'function') {
      sender = await captionMessage.getSender().catch(() => undefined);
    }

    if (!chat && typeof captionMessage.getChat === 'function') {
      chat = await captionMessage.getChat().catch(() => undefined);
    }

    const senderHandle = getEntityHandle(sender);
    const chatHandle = getEntityHandle(chat);
    const senderUrl = getEntityUrl(sender);
    const chatUrl = getEntityUrl(chat);
    const author =
      formatTelegramAuthor({
        chat,
        sender,
        postAuthor: captionMessage.postAuthor,
      }) || (captionMessage.senderId ? `sender:${captionMessage.senderId}` : `entity:${entity}`);

    const peerKey = getPeerKey(captionMessage, entity);
    const guid = `${peerKey}:album:${String(groupedId)}`;
    const attachments = await this.downloadPhotoAttachments(photoMessages);

    return {
      authoredAt,
      fetchedAt: now,
      author,
      content: text || '[photo]',
      url: senderUrl || chatUrl || '',
      platform: 'telegramUser',
      platformID: `album:${String(groupedId)}`,
      guid,
      attachments,
      raw: normalizeTelegramValue({
        entity,
        groupedId,
        ids: messages.map((message) => message.id),
        date: captionMessage.date,
        message: text,
        postAuthor: captionMessage.postAuthor,
        hasPhoto: true,
        attachmentCount: attachments.length,
        senderId: captionMessage.senderId,
        sender: sender
          ? {
              id: sender.id,
              username: sender.username,
              title: sender.title,
              firstName: sender.firstName,
              lastName: sender.lastName,
            }
          : null,
        peerId: captionMessage.peerId,
        chat: chat
          ? {
              id: chat.id,
              username: chat.username,
              title: chat.title,
              firstName: chat.firstName,
              lastName: chat.lastName,
            }
          : null,
        peerKey,
        senderHandle,
        senderUrl,
        chatHandle,
        chatUrl,
      }),
    };
  }

  async downloadPhotoAttachment(message) {
    const mediaBuffer = await message.downloadMedia({});
    const mimeType = detectImageMimeType(mediaBuffer);

    if (!Buffer.isBuffer(mediaBuffer) || !mimeType) {
      throw new Error('Failed to download Telegram photo media.');
    }

    return persistSocialImage({
      buffer: mediaBuffer,
      mimeType,
      sourcePlatform: 'telegramUser',
    });
  }

  async downloadPhotoAttachments(messages) {
    const attachments = [];

    try {
      for (const message of messages) {
        attachments.push(await this.downloadPhotoAttachment(message));
      }
    } catch (error) {
      await deleteSocialAttachments(attachments);
      throw error;
    }

    return attachments;
  }
}

module.exports = TelegramUserChannel;
