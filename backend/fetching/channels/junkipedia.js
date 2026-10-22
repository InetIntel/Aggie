
const axios = require('axios');
const { PageChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { decryptSecretsObject } = require('../utils/decryption');


class JunkipediaChannel extends PageChannel {
  static BASE_URL = 'https://www.junkipedia.org';
  static INTERVAL = 3600000;
  static PER_PAGE = 100;
  #decryptedSecrets; // private property of decrypted secrets

  
  constructor(options) {
    super({
      ...options,
      namespace: options.namespace || `junkipedia-${options.lists}`,
    });

    this.options = options;

    this.credentials = options.credentials || null;
    this.#decryptedSecrets = this.credentials?.secrets
        ? decryptSecretsObject(this.credentials.secrets)
        : {};

    this.nextPageURL = options.nextPageURL;
    const queryParams = options.queryParams || {};
    this.queryParams = {
      ...queryParams,
      per_page: queryParams.count || JunkipediaChannel.PER_PAGE,
    };
    this.interval = options.interval || JunkipediaChannel.INTERVAL;
    this.lastTimestamp = options.lastTimestamp || null;

  }

  async fetchPage() {
    let startDate;

    if (!this.lastTimestamp) {
      startDate = Math.floor((Date.now() - 6 * 60 * 60 * 1000) / 1000); // 6-hrs before current time (junkipedia data update has delays despite of hour update)
    } else {

      const sixHoursAgo = Math.floor((Date.now() - 6 * 60 * 60 * 1000) / 1000);
      const lastTimestampEpoch = Math.floor((this.lastTimestamp.getTime() + 1000) / 1000);
      
      startDate = Math.min(sixHoursAgo, lastTimestampEpoch);
    }

    const apiKey = this.#decryptedSecrets.junkipediaAPIKey || null;

    const apiRoute = '/api/v1/posts/';
    let config = {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    };

    if (this.nextPageURL) {
      config = {
        ...config,
        url: this.nextPageURL,
      };
    } else {
      config = {
        ...config,
        baseURL: JunkipediaChannel.BASE_URL,
        url: apiRoute,
        params: {
          ...this.queryParams,
          published_at_from: startDate,
          published_at_to: Math.floor((Date.now() - 5 * 60 * 60 * 1000) / 1000),
        },
      };
    }

    try {

      const response = await axios(config);

      const rawPosts = response.data.data;

      const posts = [];
      for (let i = 0; i < rawPosts.length; i++) {
        const rawPost = rawPosts[i];
        const post = this.parse(rawPost);
        posts.push(post);
      }

      const links = response.data.links;
      this.nextPageURL = links.next;

      console.log(`[Fetching-channel-Junkipedia] Success - Parsed and formatted data, total records: ${posts.length}.`);
      
      if (posts.length > 0) {
        const updatedTimestamp = config.params?.published_at_to
          ? new Date(config.params.published_at_to * 1000)
          : new Date(Date.now() - 100000);

        this.lastTimestamp = updatedTimestamp;
      }
      return posts;
      
    } catch (e) {

      console.error(`[Fetching-channel-Junkipedia] Failed - Failed parsing and formating data.`);
    }

  }

  parse(rawPost) {
    const { attributes } = rawPost;
    const { search_data_fields: searchDataFields } = attributes;
    const now = new Date();

    const author = searchDataFields.channel_name;

    const authoredAt = new Date(attributes.published_at) || now;

    const platform = searchDataFields.platform_name.toLowerCase();

    const content = searchDataFields.description;

    return new SocialMediaPost({
      authoredAt,
      fetchedAt: now,
      author,
      content,
      url: attributes.url,
      platform,
      platformID: attributes.post_uid,
      raw: rawPost,
    });
  }
}

module.exports = JunkipediaChannel;
