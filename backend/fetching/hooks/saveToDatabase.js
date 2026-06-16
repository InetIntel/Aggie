// Saves each Report to the Aggie database

const Report = require('../../models/report');
const { deleteSocialAttachments } = require('../utils/socialImageStorage');
module.exports = async function saveToDatabase(report, next) {

    try {

        const result = await Report.create(report);

        if (!result || !result._id) {
            throw new Error(`Failed saving report: ${JSON.stringify(result)}.`);
        }
        
    } catch (error) {
        await deleteSocialAttachments(report?.metadata?.attachments);
        if (error.code === 11000) {
            // Expected dedup: the channel re-fetched a post whose guid is already saved.
            console.log(`[Fetching-saveToDatabase] Skipped duplicate report (guid already saved): ${report?.guid}.`)
        } else {
            console.error(`[Fetching-saveToDatabase] Failed - Failed saving reports: ${error.message}.`)
        }
    }
    
    await next();
}
