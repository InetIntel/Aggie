'use strict';

const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Channel } = require('downstream');
const Source = require('../../models/source');
const { decryptSecretsObject } = require('../utils/decryption');
const {
  detectImageMimeType,
  persistSocialImage,
} = require('../utils/socialImageStorage');
const { normalizeMastodonServerUrl } = require('../../api/utils/mastodonUtils');

const MASTODON_MODE_PUBLIC = 'public';
const MASTODON_MODE_HOME = 'home';
const MASTODON_MODE_HASHTAG = 'hashtag';
const MASTODON_MODE_KEYWORD = 'keyword';
const MASTODON_VISIBILITY_PUBLIC = 'public';
const MASTODON_VISIBILITY_LOCAL = 'local';

function normalizeMode(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSingleValue(value) {
  return String(value || '').trim();
}

function htmlToPlainText(html) {
  if (!html) return '';
  return new JSDOM(String(html)).window.document.body.textContent?.trim() || '';
}

function normalizeStatus(rawStatus) {
  const mediaAttachments = Array.isArray(rawStatus?.media_attachments)
    ? rawStatus.media_attachments.map((attachment) => ({
        id: attachment.id,
        type: attachment.type,
        url: attachment.url,
        previewUrl: attachment.preview_url,
        description: attachment.description || '',
      }))
    : [];

  return {
    id: rawStatus?.id,
    createdAt: rawStatus?.created_at,
    url: rawStatus?.url,
    content: htmlToPlainText(rawStatus?.content),
    spoilerText: rawStatus?.spoiler_text || '',
    account: rawStatus?.account
      ? {
          id: rawStatus.account.id,
          username: rawStatus.account.username,
          acct: rawStatus.account.acct,
          displayName: rawStatus.account.display_name,
          url: rawStatus.account.url,
        }
      : null,
    mediaAttachments,
  };
}

class MastodonChannel extends Channel {
  #decryptedSecrets;
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
    this.interval = Number(process.env.API_FETCH_INTERVAL ?? 10000);
    this._tickRunning = false;
    this.mode = normalizeMode(this.source.keywords);
    this.modeValue = normalizeSingleValue(this.source.lists);
    this.publicTimelineScope =
      normalizeMode(this.source.regex) || MASTODON_VISIBILITY_LOCAL;

    this.#decryptedSecrets = this.credentials?.secrets
      ? decryptSecretsObject(this.credentials.secrets)
      : {};

    this.serverUrl = normalizeMastodonServerUrl(this.#decryptedSecrets.serverUrl);
    this.accessToken = this.#decryptedSecrets.accessToken;

    if (!this.serverUrl || !this.accessToken) {
      throw new Error('Missing required secrets for mastodon: serverUrl, accessToken');
    }

    this.validateSourceConfiguration();

    this.onTick = this.onTick.bind(this);
  }

  async start() {
    await super.start();
    await this.onTick();
    this.#timer = setInterval(() => {
      this.onTick().catch((err) => this.emit('error', err));
    }, this.interval);
  }

  async stop() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }

    await super.stop();
  }

  async onTick() {
    if (this._tickRunning) return;
    this._tickRunning = true;

    try {
      const checkpoint = this.source.lastReportDate
        ? new Date(this.source.lastReportDate)
        : new Date(0);

      const maxAcceptedDate = await this.pollTimeline(checkpoint);

      if (maxAcceptedDate) {
        await Source.findByIdAndUpdate(this.source._id, {
          $set: { lastReportDate: maxAcceptedDate },
        }).exec();

        this.source.lastReportDate = maxAcceptedDate;
      }
    } finally {
      this._tickRunning = false;
    }
  }

  validateSourceConfiguration() {
    if (
      ![
        MASTODON_MODE_PUBLIC,
        MASTODON_MODE_HOME,
        MASTODON_MODE_HASHTAG,
        MASTODON_MODE_KEYWORD,
      ].includes(this.mode)
    ) {
      throw new Error(
        'Invalid Mastodon source mode. Supported modes: public, home, hashtag, keyword.'
      );
    }

    if (this.mode === MASTODON_MODE_PUBLIC) {
      if (
        ![MASTODON_VISIBILITY_PUBLIC, MASTODON_VISIBILITY_LOCAL].includes(
          this.publicTimelineScope
        )
      ) {
        throw new Error(
          'Invalid Mastodon public timeline scope. Supported values: public, local.'
        );
      }
      return;
    }

    if (this.mode === MASTODON_MODE_HOME) {
      return;
    }

    if (!this.modeValue) {
      throw new Error(`Missing Mastodon source value for mode=${this.mode}.`);
    }
  }

  async pollTimeline(checkpoint) {

    const statuses = await this.fetchTimelineStatuses();

    const fresh = statuses
      .filter((status) => {
        if (!status?.created_at) return false;
        return new Date(status.created_at) > checkpoint;
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (!fresh.length) return null;

    let entityMaxDate = null;

    for (const status of fresh) {
      const item = await this.parseStatus(status);
      if (item != null) {
        this.enqueue(item);

        const authoredAt = new Date(status.created_at);
        if (!entityMaxDate || authoredAt > entityMaxDate) {
          entityMaxDate = authoredAt;
        }
      }
    }

    return entityMaxDate;
  }

  normalizeMastodonError(err, context = this.mode) {
    const error = err instanceof Error ? err : new Error(String(err));
    error.message = `[Fetching - mastodon] context=${context} ${error.message}`;
    return error;
  }

  async fetchTimelineStatuses() {
    if (this.mode === MASTODON_MODE_PUBLIC) {
      const response = await this.apiRequest({
        method: 'get',
        url: '/api/v1/timelines/public',
        params: {
          limit: 40,
          local: this.publicTimelineScope === MASTODON_VISIBILITY_LOCAL,
        },
      });

      return Array.isArray(response.data) ? response.data : [];
    }

    if (this.mode === MASTODON_MODE_HOME) {
      const response = await this.apiRequest({
        method: 'get',
        url: '/api/v1/timelines/home',
        params: {
          limit: 40,
        },
      });

      return Array.isArray(response.data) ? response.data : [];
    }

    if (this.mode === MASTODON_MODE_HASHTAG) {
      const hashtag = normalizeSingleValue(this.modeValue).replace(/^#/, '');
      const response = await this.apiRequest({
        method: 'get',
        url: `/api/v1/timelines/tag/${encodeURIComponent(hashtag)}`,
        params: {
          limit: 40,
          local: false,
        },
      });

      return Array.isArray(response.data) ? response.data : [];
    }

    if (this.mode === MASTODON_MODE_KEYWORD) {
      const response = await this.apiRequest({
        method: 'get',
        url: '/api/v2/search',
        params: {
          q: this.modeValue,
          type: 'statuses',
          limit: 40,
        },
      });

      return Array.isArray(response.data?.statuses) ? response.data.statuses : [];
    }

    return [];
  }

  async apiRequest(config) {
    return axios({
      ...config,
      baseURL: this.serverUrl,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(config.headers || {}),
      },
    });
  }

  async parseStatus(status) {
    const normalizedStatus = normalizeStatus(status);
    const text = normalizedStatus.content || normalizedStatus.spoilerText || '';
    const mediaAttachments = normalizedStatus.mediaAttachments || [];
    const hasMedia = mediaAttachments.length > 0;
    const hasOnlyImages = hasMedia && mediaAttachments.every((attachment) => attachment.type === 'image');

    if (!text && !hasOnlyImages) return;
    if (hasMedia && !hasOnlyImages) return;

    const attachments = hasOnlyImages
      ? await Promise.all(mediaAttachments.map((attachment) => this.downloadImageAttachment(attachment)))
      : undefined;

    const authorName =
      normalizedStatus.account?.displayName ||
      normalizedStatus.account?.acct ||
      'Mastodon';

    return {
      authoredAt: new Date(normalizedStatus.createdAt).toISOString(),
      fetchedAt: new Date(),
      author: authorName,
      content: text || '[photo]',
      url: normalizedStatus.url || normalizedStatus.account?.url || '',
      platform: 'mastodon',
      platformID: String(normalizedStatus.id),
      guid: `mastodon:${this.serverUrl}:${this.mode}:${String(normalizedStatus.id)}`,
      attachments,
      raw: {
        serverUrl: this.serverUrl,
        mode: this.mode,
        modeValue: this.modeValue || null,
        publicTimelineScope:
          this.mode === MASTODON_MODE_PUBLIC ? this.publicTimelineScope : null,
        id: normalizedStatus.id,
        createdAt: normalizedStatus.createdAt,
        url: normalizedStatus.url,
        content: normalizedStatus.content,
        spoilerText: normalizedStatus.spoilerText,
        account: normalizedStatus.account
          ? {
              id: normalizedStatus.account.id,
              username: normalizedStatus.account.username,
              acct: normalizedStatus.account.acct,
              displayName: normalizedStatus.account.displayName,
              url: normalizedStatus.account.url,
            }
          : null,
        mediaAttachments: mediaAttachments.map((attachment) => ({
          id: attachment.id,
          type: attachment.type,
          description: attachment.description,
        })),
      },
    };
  }

  async downloadImageAttachment(attachment) {
    const response = await axios.get(attachment.url, {
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response.data);
    const mimeType = response.headers['content-type'] || detectImageMimeType(buffer);

    if (!mimeType || !String(mimeType).startsWith('image/')) {
      throw new Error('Failed to download Mastodon image attachment.');
    }

    return persistSocialImage({
      buffer,
      mimeType: String(mimeType).split(';')[0],
      sourcePlatform: 'mastodon',
    });
  }
}

module.exports = MastodonChannel;
