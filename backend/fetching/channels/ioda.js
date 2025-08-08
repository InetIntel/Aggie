const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { mongoose } = require('../../database');
const REGION_CODES = require('../../config/fetching/channels/iodaMappings');
const { API_BASE_URLS, API_ROUTES, DATA_SOURCES, API_LINKED_PAGE_URLS } = require('../../config/fetching/externalApis');
const extractCleanSVGFromPage = require('../utils/iodaUtils');
const { chromium } = require('playwright');
const countries = require('i18n-iso-countries');
require('dotenv').config();

countries.registerLocale(require('i18n-iso-countries/langs/en.json'))

/**
 * A Channel that polls the Ioda Outages of configured country code.
 */
class IODAChannel extends PollChannel {

    
    static INTERVAL = process.env.API_FETCH_INTERVAL || 300000;
  
    
    constructor(options) {
        super({...options,
            namespace: options.namespace || `ioda-${options.countryCode}`,
        });

        this.options = options;

        this.queryTypes = ['region', 'geoasn-region', 'geoasn-country', 'asn-country']    

        this.metadataUrl = `${API_BASE_URLS.IODA}${API_ROUTES.IODA.ENTITY_QUERY}`;

        this.countryCode = options.countryCode || null;

        this.regionCodes = {};

        this.interval = options.interval || IODAChannel.INTERVAL;
  
        this.fetchToTimestamp = Math.floor(Date.now() / 1000); 

        this.fetchFromTimestamp = options.lastTimestamp
            ? Math.min(
                this.fetchToTimestamp - 2 * 60 * 60, 
                Math.floor(options.lastTimestamp.getTime() / 1000) 
              )
            : this.fetchToTimestamp - 2 * 60 * 60
        

        
    }   

    async initMetadata(){
        if(!Object.keys(this.regionCodes).length) {

            // Fetch latest region code - region name mapping metadata
            if (!this.metadataUrl || !this.countryCode) {
                console.error('\tInvalid metadata fetching url, use default mappings.');
                this.regionCodes = REGION_CODES;
            } else {
                const metadataUrl = new URL(this.metadataUrl);
                metadataUrl.searchParams.append('entityType', 'region');
                metadataUrl.searchParams.append('relatedTo', `country/${this.countryCode}`);

                const res = await fetch(metadataUrl);
                const data = await res.json();
                this.regionCodes = this.parseMetadata(data);
            }
            console.log('[Fetching-channel-IODA] Success - Updated metadata.');
        } else {
            console.log('[Fetching-channel-IODA] Skipped - Skipped metadata update, mapping existed.');
        }
    }

    async start() {

        await this.initMetadata();
        return super.start();
    }

    async fetch() {
        const outages = [];

        // reuseable broswer for fetching SVG components on each fetch()
        this.browser = null;
        const newBrowser = await chromium.launch({headless: true});
        if (!newBrowser) {
            console.error('debugging - Failed initializing browser for fetching graphs');
        } else {
            this.browser = newBrowser;
        }

        try{
        // update fetchTo timestamp for each fetch
        this.fetchToTimestamp = Math.floor(Date.now() / 1000); 
        this.fetchFromTimestamp = Math.min(this.fetchFromTimestamp, this.fetchToTimestamp - 2 * 60 * 60);

        
        for (const queryType of this.queryTypes) {
            try {
                // Construct query url
                const url = new URL(API_ROUTES.IODA.OUTAGE_EVENTS, API_BASE_URLS.IODA);

                if (queryType === 'region') {
                    url.searchParams.append('entityType', 'region');
                    url.searchParams.append('relatedTo', `country/${this.countryCode}`);
                } else if (queryType === 'geoasn-region') {
                    url.searchParams.append('entityType', 'geoasn');
                    url.searchParams.append('relatedTo', `region`);
                } else if (queryType === 'geoasn-country') {
                    url.searchParams.append('entityType', 'geoasn');
                    url.searchParams.append('relatedTo', `country/${this.countryCode}`);
                // Remove as current ioda api support regional AS signal via geoasn-region
                // } else if (queryType === 'asn-region') {
                //     url.searchParams.append('entityType', 'asn');
                //     url.searchParams.append('relatedTo', `region`);
                } else if (queryType === 'asn-country') {
                    url.searchParams.append('entityType', 'asn');
                    url.searchParams.append('relatedTo', `country/${this.countryCode}`);
                }

                url.searchParams.append('from', this.fetchFromTimestamp);
                url.searchParams.append('until', this.fetchToTimestamp);

                // Fetch data
                const res = await fetch(url);

                if (!res.ok) {
                    throw new Error(`Failed fetching data: ${url} - ${res.status}.`);
                } 

                const rawFeed = await res.json();

                const fetchedAt =  new Date(rawFeed.metadata.responseTime) || new Date(Date.now());

                const events = rawFeed.data || [];

                // Declare regex rule to exclude AS-region reports unrelated to the queried country
                let regexRegion = null;
                if (queryType === 'geoasn-region') {
                    regexRegion = /(\d+)-(\d+)/;
                }
                
                let newReportCount = 0;
                let existedReportCount = 0;
                let irrelevantRegionReportCount = 0;
                this.linkedPageCache = {}; // avoid duplicately extract graph components

                const collection = mongoose.connection.db.collection('reports');

                // Parse and transform each event 
                for (const event of events) {

                    // Exclude irrelevant region event
                    if (regexRegion) {
                            const match = event.location && event.location.match(regexRegion);
                            if (!match || (match && !this.regionCodes[match[2]])) {
                                irrelevantRegionReportCount += 1;
                                continue;
                            };
                    }

                    const formattedEvent = await this.parseEvent(event, queryType);

                    if (!formattedEvent) {
                        console.error(`\tFailed parsing formattedEvent: ${event}.`);
                        return;
                    }
                    
                    formattedEvent.fetchedAt = fetchedAt;

                    // De-duplicate fetched report for downstream tasks
                    try {

                        const existingReport = await collection.findOne({ guid: formattedEvent.platformID });

                        if (existingReport) {

                            await collection.updateOne(
                                { guid: formattedEvent.platformID },
                                {
                                    // update existing report if fields updated (such as endDate confirmed)
                                    $set: {
                                        content: formattedEvent.content,
                                        url: formattedEvent.url,
                                        'metadata.rawAPIResponse': formattedEvent.raw,
                                    }
                                }
                            );

                            existedReportCount += 1;

                        } else {
                            // Add new report to downstream hooks
                            outages.push(formattedEvent);
                            this.enqueue(formattedEvent);
                            newReportCount += 1;

                        }
                    } catch (err) {
                        console.error(`Error processing report for guid ${formattedEvent.platformID}:`, err);
                    }


                }

                console.log(`[Fetching-channel-IODA] Success - Parsed and formatted data from url: ${url}, total records: ${events.length}, new records: ${newReportCount}, existed records: ${existedReportCount}, irrelevant region records: ${irrelevantRegionReportCount}.`);

            } catch (e) {
                console.error(`[Fetching-channel-IODA] Failed - Failed parsing and formating data: ${this.options.media} - ${queryType}.`);
            }
        }

        
        // update latestReportDate
        this.fetchFromTimestamp = this.fetchToTimestamp;
        const updatedTimestamp = new Date(this.fetchFromTimestamp * 1000);
        if (typeof this.options?.onFetch === 'function') {
            await this.options.onFetch(updatedTimestamp);
        }

        return outages;

    } finally {

        await this.browser.close(); // ensure closing headerless browser 
    }
} 

    /**
     * Parse the fetched metadata to region code - region name mapping relationship.
     */
    parseMetadata(rawData) {
        if (!rawData.data || rawData.data.length === 0) {
            return REGION_CODES;
        }

        const regionCodes = {}
        
        rawData.data.forEach(region => {
            regionCodes[region.code] = region.name;
        });

        return regionCodes;

    }

    /**
     * Parse the fetched event data to SocialMediaPost.
     */
    async parseEvent(event, queryType) {

        // Extract event timing
        const eventStartedAtSeconds = event.start;
        const eventDurationAtSeconds = event.duration;
        const eventEndedAtSeconds = eventStartedAtSeconds + eventDurationAtSeconds;

        const eventStartedAt = new Date(eventStartedAtSeconds * 1000).toISOString();
        const eventEndedAt = new Date(eventEndedAtSeconds * 1000).toISOString();
        const eventDuration = this.formatDuration(eventDurationAtSeconds);

        // Construct content
        const dataSource = DATA_SOURCES.IODA[event.datasource];
        const content = `DataSource: ${dataSource}
        Score: ${event.score}
        Started: ${eventStartedAt}
        Ended: ${eventEndedAt}
        Outage duration ${eventDuration}`;

        // Render dashboard within a 24H time range (ending at current time)
        const urlFromTime = this.fetchToTimestamp - 12 * 60 * 60;
        const urlToTime = this.fetchToTimestamp;
        const linkedPage = `${API_LINKED_PAGE_URLS.IODA.BASE}/${event.location}?from=${urlFromTime}&until=${urlToTime}`;
        
        const guid = `${queryType}-${event.start}-${event.location}-${event.datasource}`;
        if (!guid) {
            console.error(`\tNo guid or link found in Ioda response: ${event}`);
            return;
        }

        // Extract entity
        let entityLevel = null;
        let entityScope = null;
        let entityName = null;
        let match = null;
        if (queryType.startsWith('geoasn')) {
            match = event.location_name.match(/^(.+?) -- (.+)$/)
            if (queryType === 'geoasn-region') {
                entityLevel = 'AS - Region';
                entityScope = match[2]
            } else {
                entityLevel = 'AS'
                entityScope = countries.getName(this.countryCode, "en") || this.countryCode;
            }
            entityName = `${match[1]} - ${entityScope}`;
        } else if (queryType === 'asn-country') {
            match = event.location_name.match(/^(AS[\w\d]+) \((.+)\)$/);
            entityLevel = 'AS';
            entityScope = countries.getName(this.countryCode, "en") || this.countryCode;
            entityName = `${match?.[2] ?? ' '} - ${entityScope}`;
        } else {
            entityLevel = 'Region';
            entityScope = event.location_name;
            entityName = `${entityLevel} - ${entityScope}`;

        }

        // Fetch and de-duplicate image as svg string
        let image = null;
        if (this.linkedPageCache[linkedPage]) {
            image = this.linkedPageCache[linkedPage];
        } else {

            try {
                const cleanSVG = await extractCleanSVGFromPage(this.browser, linkedPage);
                image = cleanSVG;
                this.linkedPageCache[linkedPage] = cleanSVG;
            } catch (err) {
                console.error(`Error extracting SVG for URL ${linkedPage}:`, err);
            }

        }


        return  new SocialMediaPost({
            authoredAt: eventStartedAt,
            fetchedAt: null,
            author: entityName,
            content: content,
            url: linkedPage,
            platform: this.options.media || "Ioda",
            platformID: guid,
            raw: {
                'rawEvent': event,
                'entityLevel': entityLevel,
                'entityScope': entityScope,
                'entityName': entityName,
                'dataSource': dataSource,
                'score': event.score,
                'started': eventStartedAt,
                'ended': eventEndedAt,
                'duration': eventDuration,
                'image': image, // Store image as svg string
            }
        });

    }

    /**
     * Format the eventDurationAtSeconds to HH:MM:SS format string
     */
    formatDuration(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return [
            hrs.toString().padStart(2, '0'),
            mins.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0'),
        ].join(':');
    }
}



module.exports = IODAChannel;
