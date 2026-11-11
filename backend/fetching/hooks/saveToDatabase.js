// Saves each Report to the Aggie database

const Report = require('../../models/report');
const { deleteSocialAttachments } = require('../utils/socialImageStorage');

// An OONI alert is worth more than its chart. If saving fails for any reason other
// than a duplicate, retry once without the chart so the alert still shows up.
async function saveOoniWithoutChart(report, error) {
    const raw = report?.metadata?.rawAPIResponse;
    if (report?.platform !== 'ooni' || !raw || !raw.chart) return false;

    console.warn(`[Fetching-saveToDatabase] Saving OONI alert ${report.guid} with its chart failed (${error.message}); retrying without the chart.`);
    const { chart, ...rawWithoutChart } = raw;
    const result = await Report.create({
        ...report,
        metadata: { ...report.metadata, rawAPIResponse: rawWithoutChart },
    });
    return !!(result && result._id);
}

// Put the failure on the source's event list as well as the process log, so it shows
// up on the Sources page instead of only in the server output. Never throws.
async function recordSaveFailure(report, message) {
    try {
        const { getSourceID, fetchSourceByID } = require('../sourceToChannel');
        const sourceID = report?.channel ? getSourceID(report.channel) : null;
        if (!sourceID) return;
        const source = await fetchSourceByID({ _id: sourceID });
        if (source) await source.logEvent('error', `Failed saving report ${report.guid}: ${message}`);
    } catch (loggingError) {
        console.error(`[Fetching-saveToDatabase] Could not record the failure on the source: ${loggingError.message}.`);
    }
}

module.exports = async function saveToDatabase(report, next) {

    try {

        let result;
        try {
            result = await Report.create(report);
        } catch (error) {
            if (error.code === 11000 || !(await saveOoniWithoutChart(report, error))) throw error;
            result = { _id: 'saved-without-chart' };
        }

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
            await recordSaveFailure(report, error.message);
        }
    }
    
    await next();
}
