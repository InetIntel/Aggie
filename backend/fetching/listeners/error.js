const { getSourceID, fetchSourceByID } = require('../sourceToChannel');

/**
 * Listens to the Downstream `error` event
 */
module.exports = async function (err, channelID) {
    console.error(err);

    // If `channelID` is defined then the error came from a Channel 
    if (channelID) {
        const sourceID = getSourceID(channelID);
        const source = await fetchSourceByID({ _id: sourceID });

        // The source may have been deleted while its channel was still polling.
        if (source) await source.logEvent('error', err.message);
    }
}