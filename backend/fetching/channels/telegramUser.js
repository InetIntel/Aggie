'use strict';

const { Channel } = require('downstream');
const { TelegramClient } = require('telegram');
const { Logger } = require('telegram/extensions');
const { StringSession } = require('telegram/sessions');
const { decryptSecretsObject } = require('../utils/decryption');
const Source = require('../../models/source');

// supports comma-separated lists
function parseListsToEntities(lists) {
  if (!lists || typeof lists !== 'string') return [];
  return lists
    .split(/[\n,]+/)

    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
    const limit = 50;
    const msgs = await this.#client.getMessages(entity, { limit });

    const fresh = msgs
      .filter((m) => {
        if (!m?.date) return false;

        const messageDate = m.date instanceof Date
          ? m.date
          : new Date(m.date * 1000);

        return messageDate > checkpoint;
      })
      .sort((a, b) => {
        const aDate = a.date instanceof Date ? a.date : new Date(a.date * 1000);
        const bDate = b.date instanceof Date ? b.date : new Date(b.date * 1000);
        return aDate - bDate;
      });

    if (!fresh.length) return null;

    let entityMaxDate = null;

    for (const m of fresh) {
      const item = await this.parse(m, { entity });
      if (item != null) {
        this.enqueue(item);

        const messageDate = m.date instanceof Date
          ? m.date
          : new Date(m.date * 1000);

        if (!entityMaxDate || messageDate > entityMaxDate) {
          entityMaxDate = messageDate;
        }
      }
    }

    return entityMaxDate;
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
    const text = message?.message;
    if (!text) return;

    const now = new Date();

    const messageDate =
      message.date instanceof Date
        ? message.date
        : new Date(message.date * 1000);

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

    return {
      authoredAt,
      fetchedAt: now,
      author,
      content: text,
      url,
      platform: 'telegramUser',
      platformID,
      guid, 
      raw: normalizeTelegramValue({
        entity,
        id: message.id,
        date: message.date,
        message: message.message,
        postAuthor: message.postAuthor,
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
}

module.exports = TelegramUserChannel;
