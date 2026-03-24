// Converts a Downstream SocialMediaPost to an Aggie Report.

const { getSourceID, getChannel } = require('../sourceToChannel');
const { parseJunkipediaPostMetadata } = require('../utils/junkipediaUtils');

module.exports = async function postToReport(post, next) {
    const {
        channel: channelID,
        platform,
        raw,
        isOutageEvent = false,
        isAsnScoped = false,
        asn  = null,
        outageStartedAt = null,
        outageEndedAt = null,
        geoScope = null,
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
    } else if (platform === 'telegramBot') {
        post._media = [ 'telegram' ];
    } else {
        post._media = [ platform ];
    }
    post.tags = channel.tags;
    post.guid = post.guid || post.link || post.platformID || post.id || null;

    post.isOutageEvent = isOutageEvent;
    post.isAsnScoped = isAsnScoped;
    if (asn !== null) {post.asn = asn};
    if (outageStartedAt !== null) {post.outageStartedAt = outageStartedAt};
    if (outageEndedAt !== null) {post.outageEndedAt = outageEndedAt};
    if (geoScope !== null) {post.geoScope = geoScope};


    let metadata;
    if (isKeywordSearchTwitter) {
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
    } else if (
        platform === 'ioda' ||
        platform === 'cloudflare' ||
        platform === 'telegramBot'
    ) {
        metadata = {rawAPIResponse: raw} || null;
    } else if (platform === 'telegramUser') {
        metadata = {
            accountHandle: raw?.senderHandle || raw?.chatHandle || null,
            accountUrl: raw?.senderUrl || raw?.chatUrl || null,
            rawAPIResponse: raw,
        };
    } else {
        metadata = parseJunkipediaPostMetadata(raw);
    };

    post.metadata = metadata;

    await next();
}
