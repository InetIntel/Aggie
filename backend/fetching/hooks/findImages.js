// Saves each Report to the Aggie database
const chalk = require('chalk');
const aiprediction = require('../../models/aiprediction')

var database = require('../../database');
var mongoose = database.mongoose;


module.exports = async function saveToDatabase(report, next) {

    const imageUrls = getImagePostUrl(report);
    console.log(`${chalk.blue("[TRUEMEDIA]")} ${imageUrls}`)

    if (imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls) {
            await aiprediction.create({ url: url, reportId: new mongoose.Types.ObjectId(report._id), id: report.guid }).catch((e) => console.error(e))

        }
        console.log(`${chalk.blue("[TRUEMEDIA]")} new post added to aiprediction`)
    }

    await next();
}
// we need to find images
function getImagePostUrl(report) {

    let urlList = []
    if (report._media[0] === "twitter") {
        if (report.metadata?.isKeywordSearchTwitter) {
            const media_keys = report.metadata.rawAPIResponse?.post?.attachments?.media_keys
            const hasImage = !!media_keys && media_keys.length > 0;

            if (hasImage) return [report.url]
            else return []
        }

        const twitterUrl = "https://x.com/i/status/"
        const rawPostData = report.metadata.rawAPIResponse.attributes?.post_data
        // check top level
        const media = rawPostData?.entities?.media
        if (media && media.length !== 0) urlList.push(twitterUrl + rawPostData?.id)

        const retweetResult = rawPostData?.retweeted_status_result?.result;
        const quotedResult = rawPostData?.api_data?.quoted_status_result?.result;
        // check quote retweet
        const result = retweetResult || quotedResult;
        const arr = getTwitterUrlwithImage(result);
        return [...urlList, ...arr]
    }
    if (report._media[0] === "instagram" || report._media[0] === "tiktok") {

        return [report.url]
    }
    if (report._media[0] === "truthsocial") {
        const rawPostData = report.metadata.rawAPIResponse.attributes?.post_data
        const media = rawPostData.media_attachments
        if (media && media.length !== 0) return [report.url]
    }
    if (report._media[0] === "facebook") {
        const rawPostData = report.metadata.rawAPIResponse.attributes?.post_data
        const media = rawPostData.media
        if (media && media.length !== 0) return [report.url]
    }
    return urlList;

}

function getTwitterUrlwithImage(result) {
    let arr = []

    const media = result?.entities?.media

    if (media && media.length !== 0) arr.push(twitterUrl + result?.rest_id)
    // retweets can be quote tweets
    const innerQuoteResult = result?.quoted_status_result?.result;
    if (!innerQuoteResult) return arr;

    const innerPost = getTwitterUrlwithImage(innerQuoteResult)
    return [...arr, ...innerPost]
}