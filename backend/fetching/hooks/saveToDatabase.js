// Saves each Report to the Aggie database

const Report = require('../../models/report');
module.exports = async function saveToDatabase(report, next) {

    try {

        const result = await Report.create(report);

        if (!result || !result._id) {
            throw new Error(`Failed saving report: ${JSON.stringify(result)}.`);
        }
        
    } catch (error) {
        console.error(`[Fetching-saveToDatabase] Failed - Failed saving reports: ${error.message}.`)
    }
    
    await next();
}
