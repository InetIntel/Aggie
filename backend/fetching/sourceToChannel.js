/**
 * A set of helpful utility functions for converting
 * between Aggie Sources and Downstream Channels.
 */

const { builtin } = require('downstream');
const Source = require('../models/source');
const Credentials = require('../models/credentials'); // registers the Credentials schema
const config = require('../config/secrets');
const downstream = require('./downstream');

const RSSChannel = require('./channels/rss');
const IODAChannel = require('./channels/ioda');
const CloudflareChannel = require('./channels/cloudflare');
const JunkipediaChannel = require('./channels/junkipedia');
const TelegramBotChannel = require('./channels/telegramBot');
const TelegramUserChannel = require('./channels/telegramUser');
const MastodonChannel = require('./channels/mastodon');

// const { TwitterPageChannel, JunkipediaChannel } = builtin;


// Key: Source ID; Value: Channel ID
const sourceChannelJoin = {};

/**
 * Returns whether Aggie has fetching enabled or not.
 */
function isFetching() {
    return config.get().fetching;
}

/**
 * Fetches the Source with the given ID from the database,
 * including the Credentials that the Source uses.
 */
async function fetchSourceByID(src) {
    const { _id: sourceID } = src;
    const source = await Source
        .findById(sourceID)
        .populate({ path: 'credentials' })
        .exec();
    return source;
}

/**
 * Returns whether there is a Channel corresponding to the given Source.
 */
function hasChannel(source) {
    const { _id: sourceID } = source;
    const channelID = sourceChannelJoin[sourceID];
    return !!channelID;
}

/**
 * Disables the Channel corresponding to the given Source.
 */
async function disableChannel(source) {
    const { _id: sourceID } = source;
    const channelID = sourceChannelJoin[sourceID];
    const channel = downstream.channel(channelID);

    channel.enabled = false;

    if (isFetching()) {
        await channel.stop();
    }
}

/**
 * Deletes the Channel corresponding to the given Source.
 */
function deleteChannel(source) {
    const { _id: sourceID } = source;
    const channelID = sourceChannelJoin[sourceID];
    downstream.unregister(channelID);
    delete sourceChannelJoin[sourceID];
}

/**
 * Creates a new Channel corresponding to the given Source.
 */
function createChannel(source) {
    let channel;

    const {
        _id,
        lastReportDate,
        keywords,
        lists,
        credentials,
        media,
        tags,
        enabled,
        regex
    } = source;

    let options = {
        lastTimestamp: lastReportDate,
        onFetch: async (updatedTimestamp) => { // update naming to avoid confusion
            return Source.updateOne(
                { _id },
                { lastReportDate: updatedTimestamp },
            ).exec();
        }
    };

    // console.log(source)
    switch(media) {
        case 'facebook':
        case 'instagram':
            options = {
                ...options,
                dashboardToken: credentials.secrets.dashboardAPIToken,
                queryParams: {
                    searchTerm: keywords, // TODO rename to something better
                    platforms: media,
                },
            };
            channel = new AggieCrowdTangleChannel(options);
            break;
        case 'twitter':
            retweet_remove_list = " -is:retweet -from:2750775076"
            // retweet_remove_list = "";
            // retweet_remove_list = " -retweets_of:3932768472 -retweets_of:4239551 -retweets_of:826891982559641604"
            options = {
                ...options,
                credentials: {
                    consumerKey: credentials.secrets.consumerKey,
                    consumerSecret: credentials.secrets.consumerSecret,
                },
                queryParams: {
                    query: regex + retweet_remove_list, // TODO rename to something better
                    max_results: 100,
                    "tweet.fields": "attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,possibly_sensitive,public_metrics,referenced_tweets,reply_settings,source,text,withheld,edit_history_tweet_ids,edit_controls",
                    "expansions": "attachments.media_keys,author_id,geo.place_id,in_reply_to_user_id,referenced_tweets.id,entities.mentions.username,referenced_tweets.id.author_id,edit_history_tweet_ids",
                    "media.fields": "duration_ms,height,media_key,preview_image_url,public_metrics,type,url,width",
                    "place.fields": "contained_within,country,country_code,full_name,geo,id,name,place_type",
                    "user.fields": "location,profile_image_url,description,created_at,id,name,username,public_metrics,url",
                },
                // Every 1 minute pull 100
                interval: 60000,
            }
            console.log("twitter options")
            console.log(options)
            channel = new TwitterPageChannel(options);
            break;
        case 'telegramBot':
            options = {
                ...options,
                botAPIToken: credentials,
            };
            channel = new TelegramBotChannel(options);
            break;
        case 'telegramUser':
            options = {
                ...options,
                source: source,
                credentials: credentials,
                lists: lists,
            };
            channel = new TelegramUserChannel(options);
            break;
        case 'mastodon':
            options = {
                ...options,
                source: source,
                credentials: credentials,
                lists: lists,
            };
            channel = new MastodonChannel(options);
            break;
        case 'junkipedia':
            // Special case of 

            let queryParams = {};
            if (lists == '4813') {
                queryParams = {
                    "search_terms": '4813',
                    keyword: keywords,
                    sort_order: "desc"
                }
            } else {
                queryParams = {
                    lists: lists,
                    keyword: keywords,
                    sort_order: "desc"
                }
            }

            options = {
                ...options,
                credentials: credentials,
                // Reference - https://www.junkipedia.org/apidocs#tag/Posts/paths/~1api~1v1~1posts/get
                // TODO: Add list or channel specification
                // interval is set to 3 minutes
                interval: 180000,
                queryParams: queryParams,
            }
            // console.log(credentials)
            // console.log(options)
            channel = new JunkipediaChannel(options);
            break;
        case 'rss':
            // Lists in this case are a list of RSS feed URLs
            options = {
                ...options,
                rssList: lists,
                regex: regex,
            };
            channel = new RSSChannel(options);
            break;
        case 'ioda':
            options = {
                ...options,
                media: media,
                countryCode: keywords,
            };
            channel = new IODAChannel(options);
            break;
        case 'cloudflare':
            options = {
                ...options,
                media: media,
                countryCode: keywords,
                credentials: credentials,
            }
            channel = new CloudflareChannel(options);
            break;
        default:
    }

    if (channel) {
        console.log(`[Fetching-createChannel] Success - Created channel: ${source.media}.`);
    } else {
        console.error(`[Fetching-createChannel] Failed - Creating channel: ${source.media}.`);
    }

    channel.enabled = enabled;
    channel.tags = tags;

    const channelID = downstream.register(channel);
    sourceChannelJoin[_id] = channelID;
}

/**
 * Enables the Channel corresponding to the given Source.
 */
async function enableChannel(source) {
    const { _id: sourceID } = source;
    const channelID = sourceChannelJoin[sourceID];
    const channel = downstream.channel(channelID);

    channel.enabled = true;

    if (isFetching()) {
        await channel.start();
    }
}

/**
 * Creates a Channel for each Source, starting
 * all Channels with an enabled Source.
 */
async function initChannels() {
    const fetching = isFetching();

    const sources = await Source
        .find({})
        .populate({ path: 'credentials' })
        .exec();

    
    console.log("PREPARING ALL ENABLED CHANNELS")

    // create & start all enabled Channels
    sources.forEach((source) => createChannel(source));

    await downstream.start((_, channel) => fetching && channel.enabled);
}

/**
 * Returns the Source ID associated with the given channel ID.
 */
function getSourceID(channelID) {
    return Object.keys(sourceChannelJoin).find(
        (sourceID) => sourceChannelJoin[sourceID] === channelID
    );
}

/**
 * Returns the Channel associated with the given channel ID.
 */
function getChannel(channelID) {
    return downstream.channel(channelID);
}

module.exports = {
    initChannels,
    hasChannel,
    disableChannel,
    deleteChannel,
    createChannel,
    enableChannel,
    fetchSourceByID,
    getSourceID,
    getChannel,
}
