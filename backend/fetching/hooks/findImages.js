// Saves each Report to the Aggie database

const aiprediction = require('../../models/aiprediction')
module.exports = async function saveToDatabase(report, next) {

    const imageUrls = getImagePostUrl(report);
    if (imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls) {
            await aiprediction.create({ url: url })

        }
        console.log("[truemedia] new truemedia document created")
    }

    await next();
}
// we need to find images
function getImagePostUrl(report) {

    let urlList = []
    if (report._media[0] === "twitter") {
        const twitterUrl = "https://x.com/i/status/"
        const rawPostData = report.metadata.rawAPIResponse.attributes?.post_data
        // check top level
        const media = rawPostData?.entities?.media
        if (media && media.length === 0) urlList.push(twitterUrl + rawPostData?.id)

        const retweetResult = rawPostData?.retweeted_status_result?.result;
        const quotedResult = rawPostData?.api_data?.quoted_status_result?.result;
        // check quote retweet
        const result = retweetResult || quotedResult;
        getTwitterUrlwithImage(result, urlList);
        return urlList
    }
    if (report._media[0] === "instagram" || report._media[0] === "tiktok") {

        return [report.url]
    }
    if (report._media[0] === "truthsocial") {
        const rawPostData = report.metadata.rawAPIResponse.attributes?.post_data
        const media = rawPostData.media_attachments
        if (media && media.length === 0) return [report.url]
    }
    if (report._media[0] === "facebook") {
        const rawPostData = report.metadata.rawAPIResponse.attributes?.post_data
        const media = rawPostData.media
        if (media && media.length === 0) return [report.url]
    }
    return urlList;

}

function getTwitterUrlwithImage(result, array) {
    const media = result?.entities?.media
    if (media && media.length === 0) array.push(twitterUrl + result?.rest_id)
    // retweets can be quote tweets
    const innerQuoteResult = result?.quoted_status_result?.result;
    const innerPost = !!innerQuoteResult
        ? getTwitterUrlwithImage(innerQuoteResult, array)
        : undefined;
}