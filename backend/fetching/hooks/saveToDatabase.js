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
        console.error(`[Fetching-saveToDatabase] Failed - Failed saving reports: ${error.message}.`)
    }
    
    await next();
}
