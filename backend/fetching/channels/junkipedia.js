
const axios = require('axios');
const { PageChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { decryptSecretsObject } = require('../utils/decryption');


class JunkipediaChannel extends PageChannel {
  static BASE_URL = 'https://www.junkipedia.org';
  static INTERVAL = 10000;
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
    console.log('debugging-this.lastTimestamp: ', this.lastTimestamp);
  }

  async fetchPage() {
    let startDate;
    if (this.lastTimestamp) {
      startDate = new Date(this.lastTimestamp.getTime() + 1000);
      console.log('debugging- lastTimestamp exist, startDate: ', startDate);
    } else {
      startDate = new Date();
      startDate.setHours(startDate.getHours() - 2);
      console.log('debugging- No lastTimestamp, startDate: ', startDate);
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
          published_at_from: Math.round(startDate.getTime() / 1000),
          published_at_to: Math.round(new Date().getTime() / 1000),
        },
      };
    }

    console.log('debugging- config.published_at_from: ', config.params.published_at_from, 'config.published_at_to: ', config.params.published_at_to);
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
      
      const updatedTimestamp = config.params?.published_at_to
        ? new Date(config.params.published_at_to * 1000)
        : new Date(Date.now() - 100000);

      this.lastTimestamp = updatedTimestamp;

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
