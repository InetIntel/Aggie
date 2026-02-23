const { Channel } = require('downstream');
const TelegramBot = require('node-telegram-bot-api');
const { decryptSecretsObject } = require('../utils/decryption');
const { options } = require('sanitize-html');

/**
 * A Channel that polls the Telegram API for messages sent to a Telegram bot.
 */
class TelegramBotChannel extends Channel {


    #decryptedSecrets; // private property of decrypted secrets

    constructor(options) {
        super(options);

        if (!options.botAPIToken) {
            throw new Error('The `botAPIToken` field is required.');
        }

        // initialize TelegramBotChannel variables
        this.telegramMessageListener = this.onTelegramMessage.bind(this);
        this.telegramErrorListener = this.onTelegramError.bind(this);
        
        this.credentials = options.botAPIToken || null;
        this.#decryptedSecrets = this.credentials?.secrets
            ? decryptSecretsObject(this.credentials.secrets)
            : {};
        
        this.bot = new TelegramBot(this.#decryptedSecrets.botAPIToken, { polling: false });
    }

    /**
     * Starts the TelegramBot.
     */
    async start() {

        await super.start();

        // start polling the Telegram Bot API

        this.bot.on('message', this.telegramMessageListener);
        this.bot.on('channel_post', this.telegramMessageListener);

        
        this.bot.on('error', this.telegramErrorListener);
        this.bot.on('polling_error', this.telegramErrorListener);
        this.bot.on('webhook_error', this.telegramErrorListener);

        this.bot.startPolling( {
            interval: Number(process.env.API_FETCH_INTERVAL ?? 300000),
            params: {
              timeout: 0,
              allowed_updates: ['message','channel_post','edited_channel_post'],
            },
        });
    }

    /**
     * Stops the TelegramBot.
     */
    async stop() {
        // stop polling the Telegram Bot API

        this.bot.removeListener('message', this.telegramMessageListener);
        this.bot.removeListener('channel_post', this.telegramMessageListener);

        this.bot.removeListener('error', this.telegramErrorListener);
        this.bot.removeListener('polling_error', this.telegramErrorListener);
        this.bot.removeListener('webhook_error', this.telegramErrorListener);

        this.bot.stopPolling();

        await super.stop();
    }

    onTelegramMessage(message) {
        const item = this.parse(message);
        if (item != null) {this.enqueue(item)};
    }

    onTelegramError(err) {
        if (err.response) {
            switch (err.response.code) {
                case 'EPARSE':
                    err.message = err.response.body;
                    break;
                case 'ETELEGRAM':
                    err.message = err.response.body.description;
                    break;
                default:
            }
        }
        this.emit('error', err);
    }

    /**
     * Parse the given raw message into a SocialMediaPost.
     */
    parse(rawMessage) {
        // See reference: https://core.telegram.org/bots/api#message

        // Temporary: ignore all messages that are not text b/c multimedia parsing is complicated
        if (!rawMessage.text) return;

        const now = new Date();
        let author;
        if (rawMessage.chat.type == 'channel') {
            author = rawMessage.chat.title + ' (channel)';
        } else if (rawMessage.chat.type == 'group' || rawMessage.chat.type == 'supergroup') {    // for group / supergroup 
            const groupName = rawMessage.chat.title + ' (group)';

            const firstName = rawMessage.from.first_name ? rawMessage.from.first_name : '';
            const lastName = rawMessage.from.last_name ? rawMessage.from.last_name : '';
            const userName = `${firstName} ${lastName}`;
            
            author = `${groupName} ${userName}`;
        } else if (rawMessage.chat.type == 'private') { // for DMs
            const firstName = rawMessage.from.first_name ? rawMessage.from.first_name : '';
            const lastName = rawMessage.from.last_name ? rawMessage.from.last_name : '';
            author = `${firstName} ${lastName}`;
        }

        const authoredAt = new Date(rawMessage.date * 1000).toISOString();
        const content = rawMessage.text;
        let url = '';
        // if (rawMessage.chat.type === 'channel') {    # deprecated
        //     url = "https://t.me/" + rawMessage.chat.username;
        // }
        const platformID = rawMessage.message_id;

        return {
            authoredAt,
            fetchedAt: now,
            author,
            content,
            url,
            platform: "telegramBot",
            platformID,
            raw: rawMessage,
        }
    }

}

module.exports = TelegramBotChannel;