// Converts a Downstream SocialMediaPost to an Aggie Report.

const { getSourceID, getChannel } = require('../sourceToChannel');
const { parseJunkipediaPostMetadata } = require('../util');

module.exports = async function postToReport(post, next) {
    const {
        channel: channelID,
        platform,
        raw,
    } = post;
    const channel = getChannel(channelID);
    const sourceID = getSourceID(channelID);

    post._sources = [ sourceID ];
    post._media = [ platform ];
    post.tags = channel.tags;
    post.guid = post.guid || post.link || post.platformID || null;


    let metadata;
    if (platform === 'RSS') {
        // What do we want here?
        metadata = {
            // title: raw.title || null,
            // description: raw.description || null,
            // link: raw.link || null,
            // image: raw.image || null,
            // date: raw.date || null,


            // junkipediaId: id || null,
            // channelId: channel_id || null,
            // accountHandle: channel_name || null,
            // accountUrl: channel_url_external || null,
            // mediaUrl: thumbnail_url || null,
            // // TODO: This may need to be adapted. Also, figure out difference between engagement_data and engagement_fields
            // actualStatistics: engagement_data || null,
            rawAPIResponse: raw,
        } 
        // post.guid = post.guid || post.link || null;
    } else {
        metadata = parseJunkipediaPostMetadata(raw);
    };
    // switch (platform) {
    //     case 'facebook':
    //     case 'instagram': {
    //         const {
    //             caption,
    //             description,
    //             imageText,
    //             id,
    //             platform: rawPlatform,
    //             type,
    //             account,
    //             media,
    //             statistics,
    //             crowdtangleTags,
    //         } = raw;

    //         metadata = {
    //             caption: caption || null,
    //             description: description || null,
    //             imageText: imageText || null,
    //             crowdtangleId: id || null,
    //             platform: rawPlatform || null,
    //             type: type || null,
    //             accountVerified: account ? account.verified : false,
    //             accountHandle: account ? account.handle : null,
    //             subscriberCount: account ? account.subscriberCount : 0,
    //             accountUrl: account ? account.url : null,
    //             mediaUrl: media ? media.map(
    //                 ({ type, url }) => ({ type, url })
    //             ) : null,
    //             actualStatistics: statistics.actual || null,
    //             expectedStatistics: statistics.expected || null,
    //             rawAPIResponse: raw,
    //             ct_tag: crowdtangleTags
    //         }

    //         switch(platform) {
    //             case 'facebook':
    //                 const {
    //                     brandedContentSponsor,
    //                     title,
    //                     link,
    //                 } = raw;

    //                 metadata = {
    //                     ...metadata,
    //                     sponsor: brandedContentSponsor || null,
    //                     title: title || null,
    //                     externalUrl: link || null,
    //                 };
    //             default:
    //         }
    //         break;
    //     }
    //     case 'twitter': {
    //         const { post, user } = raw;
    //         const {
    //             id,
    //             public_metrics: post_public_metrics,
    //             referenced_tweets = [],
    //         } = post;

    //         const isRetweet = referenced_tweets.findIndex((t) => t.type === 'retweeted') !== -1;
            
    //         const {
    //             retweet_count,
    //             like_count
    //         } = post_public_metrics;

    //         const {
    //             public_metrics: user_public_metrics
    //         } = user;

    //         const {
    //             followers_count,
    //             following_count,
    //             verified,
    //         } = user_public_metrics;

    //         metadata = {
    //             tweetID: id,
    //             verified: verified ? verified : false,
    //             followerCount: followers_count ? followers_count : 0,
    //             followingCount: following_count ? following_count: 0,
    //             retweetCount: retweet_count ? retweet_count : 0,
    //             likeCount: like_count ? like_count : 0,
    //             rawAPIResponse: raw,
    //         }
    //         break;
    //     }
    //     // case 'telegram': {
    //     //     const { chat } = raw;
    //     //     const chatTitle = chat.title;
    //     //     const chatType = chat.type;

    //     //     metadata = {
    //     //         chatTitle,
    //     //         chatType,
    //     //         rawAPIResponse: raw,
    //     //     }
    //     //     break;
    //     // }
    //     case 'junkipedia': {
    //         metadata = parseJunkipediaPostMetadata(raw);
    //         metadata.platform = platform || null; 
    //     }
    //     default: {
    //         metadata = {};
    //         break;
    //     }
    // }
    post.metadata = metadata;

    await next();
}