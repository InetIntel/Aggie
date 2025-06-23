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
    let isKeywordSearchTwitter = false;
    if (platform == 'twitter' && raw && raw.post) {
        isKeywordSearchTwitter = true;
    } 

    post._sources = [ sourceID ];
    if (platform === 'facebookdirect') {
        post._media = [ 'facebook' ];
    } else if (platform === 'instagramdirect') {
        post._media = [ 'instagram' ];
    } else {
        post._media = [ platform ];
    }
    post.tags = channel.tags;
    post.guid = post.guid || post.link || post.platformID || post.id || null;


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
    } else if (isKeywordSearchTwitter) {
        const { post, user } = raw;
                const {
                    id,
                    public_metrics: post_public_metrics,
                    referenced_tweets = [],
                } = post;
    
                const isRetweet = referenced_tweets.findIndex((t) => t.type === 'retweeted') !== -1;
                
                const {
                    retweet_count,
                    like_count,
                    reply_count,
                    impression_count
                } = post_public_metrics;
    
                const {
                    public_metrics: user_public_metrics
                } = user;
    
                const {
                    followers_count,
                    following_count,
                    verified,
                } = user_public_metrics;

                actualStatistics = {
                    view_count: impression_count ? impression_count : 0,
                    reply_count: reply_count ? reply_count : 0,
                    retweet_count: retweet_count ? retweet_count : 0,
                    like_count: like_count ? like_count : 0,
                }
    
                metadata = {
                    isKeywordSearchTwitter: true,
                    tweetID: id,
                    accountHandle: user.username,
                    accountUrl: user.url,
                    mediaUrl: null,
                    verified: verified ? verified : false,
                    actualStatistics:  actualStatistics,
                    followerCount: followers_count ? followers_count : 0,
                    followingCount: following_count ? following_count: 0,
                    retweetCount: retweet_count ? retweet_count : 0,
                    likeCount: like_count ? like_count : 0,
                    rawAPIResponse: raw,
                }
    } else {
        metadata = parseJunkipediaPostMetadata(raw);
    };
    post.metadata = metadata;

    await next();
}