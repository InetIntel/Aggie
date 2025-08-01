function parseJunkipediaPostMetadata(raw) {
    // console.log("JUNKIPEDIA POST GET");
    const { attributes } = raw;
    const {engagement_data, published, id, channel_id, image_text, thumbnail_url, search_data_fields } = attributes
    const {
        caption,
        description,
        platform: rawPlatform,
        type,
        account,
        media,
        statistics,
        crowdtangleTags,
    } = raw;

    const { channel_data } = search_data_fields;
    const { channel_url_external, channel_name } = channel_data;

    
    // Broadly, would want some cases for different sources maybe to allow for greater flexibility
    metadata = {
        imageText: image_text || null,
        junkipediaId: id || null,
        channelId: channel_id || null,
        accountHandle: channel_name || null,
        accountUrl: channel_url_external || null,
        mediaUrl: thumbnail_url || null,
        // TODO: This may need to be adapted. Also, figure out difference between engagement_data and engagement_fields
        actualStatistics: engagement_data || null,
        rawAPIResponse: raw,
        // TODO: Include some info about lists


        // TODO: Understand typing and standardize it to fit with the rest of the app
        // type: type || null,
        // caption: caption || null,
        // description: description || null,
        // accountVerified: account ? account.verified : false,
        // subscriberCount: account ? account.subscriberCount : 0,
        
    }


    return metadata
}

module.exports = {parseJunkipediaPostMetadata};