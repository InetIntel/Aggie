//TODO: 
// make code modulize -- Done
// update lastReportDate attribute -- Done
// add graph link


const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { mongoose } = require('../../database');
const { API_BASE_URLS, API_ROUTES, DATA_SOURCES, API_LINKED_PAGE_URLS } = require('../../config/fetching/externalApis');


/**
 * A Channel that polls the RSS feed of a list of URLs.
 */
class CloudflareChannel extends PollChannel {

    // This is ms so 100000 ms = 100 seconds
    static INTERVAL = 100000;
  
    constructor(options) {

        super({...options,
            namespace: options.namespace || `cloudflare-${options.countryCode}`
        }),

        this.options = options;

        this.countryCode = options.countryCode || null;

        this.credentials = options.credentials || null;

        this.interval = options.interval || CloudflareChannel.INTERVAL;

        // Fetch time range from 2H ago (or an earlier timestamp if specified) till now
        const fetchToUTCTime = new Date(Date.now());
        const fetchFromUTCTime = options.lastTimestamp
            ? new Date(Math.min(options.lastTimestamp, fetchToUTCTime - 2 * 60 * 60 * 1000))
            : new Date(fetchToUTCTime - 2 * 60 * 60 * 1000);

        this.fetchToTimestamp = fetchToUTCTime.toISOString().split('.')[0] + 'Z'; 
        this.fetchFromTimestamp = fetchFromUTCTime.toISOString().split('.')[0] + 'Z';  
       
    }

    async fetch() {
        
        const outages = [];

        // Construct query url
        const url = new URL(API_ROUTES.CLOUDFLARE.TRAFFIC_ANOMALIES, API_BASE_URLS.CLOUDFLARE);
        url.searchParams.append("dateStart", this.fetchFromTimestamp);
        url.searchParams.append("dateEnd", this.fetchToTimestamp);

        try {
            // Fetch data
            const apiToken = this.credentials?.secrets?.cloudflareApiToken || null;

            if (!apiToken || apiToken.secrets) {
                throw new Error(`Failed getting credential for the source ${this.options.namespace}.`);
            }
            
            const res = await fetch(url,{
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                },
            });

            if (!res.ok) {

                throw new Error(`Failed fetching traffic anomalies: ${url} - ${res.status}.`);
            } 

            const fetchedAt = res.headers.get('date') || Date.now(); 

            const rawFeed = await res.json();

            if (!rawFeed.success) {
                throw new Error(`Failed fetching valid data: ${rawFeed.errors}`);
            } else if (!rawFeed.result || !Array.isArray(rawFeed.result.trafficAnomalies)) {
                throw new Error(`Failed parsing traffic anomalies data.`);
            }

            const events = rawFeed.result.trafficAnomalies;

            let newReportCount = 0;
            let existedReportCount = 0;
            let irrelevantRegionReportCount = 0;
            
            const collection = mongoose.connection.db.collection('reports');

            // Parse and transform each event 
            for (const event of events) {
            
                const matchesLocation = event.locationDetails?.code === this.countryCode;
                const matchesAsnLocation = event.asnDetails?.location?.code === this.countryCode;
        
                if ( !matchesLocation && !matchesAsnLocation ) {
                    irrelevantRegionReportCount += 1;
                    continue;
                }

                const formattedEvent = this.parseEvent(event, matchesLocation);              

                if (!formattedEvent) {
                    console.error(`\tFailed parsing cloudflare traffic anomaly: ${event}.`);
                    continue;
                }      
                
                formattedEvent.fetchedAt = fetchedAt;

                // De-duplicate fetched report for downstream tasks
                try {

                    const existingReport = await collection.findOne({ guid: formattedEvent.platformID });

                    if (existingReport) {

                        existedReportCount += 1;

                    } else {

                        // Add new report to downstream hooks
                        outages.push(formattedEvent);
                        this.enqueue(formattedEvent);
                        newReportCount += 1;

                    }

                } catch (err) {
                    console.error(`Error processing report for guid ${guid}:`, err);
                }


            }

            console.log(`[Fetching-channel-Cloudflare] Success - Parsed and formatted data from url: ${url}, total records: ${events.length}, new records: ${newReportCount}, existed records: ${existedReportCount}, irrelevant region records: ${irrelevantRegionReportCount}.`);
        } catch (e) {
            console.error(`[Fetching-channel-Cloudflare] Failed - Failed parsing and formating data: ${this.options.media}.`);
        }

        const updatedTimestamp = new Date(this.fetchToTimestamp);
        if (typeof this.options?.onFetch === 'function') {
            await this.options.onFetch(updatedTimestamp);
        }

        return outages;

    }


    /**
     * Parse the fetched event data to SocialMediaPost.
     */
    parseEvent(event, matchesLocation) {
          
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);
        
        const eventStartedAt = startDate.toISOString();
        const eventEndedAt = endDate.toISOString();
        const eventDuration = this.formatDuration(
            Math.floor((endDate - startDate) / 1000)
        ); 

        const eventStartDate = eventStartedAt.slice(0, 10);
        const eventEndDate = eventEndedAt.slice(0, 10);

        let entityLevel = null;
        let entityScope = null;
        let entityName = null;
        let linkedPage = null;
        let image = null;

        console.log('startDate: ', startDate, typeof(startDate));
        console.log('eventStartedAt: ', eventStartedAt, typeof(eventStartedAt));
        console.log('eventStartDate: ', eventStartDate, typeof(eventStartDate));
        if (matchesLocation) {
            entityLevel = 'Country';
            entityScope = event.locationDetails.name;
            entityName = `${entityLevel} - ${entityScope}`;
            linkedPage = `${API_LINKED_PAGE_URLS.CLOUDFLARE.BASE}/${event.locationDetails.code}&dateStart=${eventStartDate}&dateEnd=${eventEndDate}`;
            image = `${API_LINKED_PAGE_URLS.CLOUDFLARE.BASE}/${API_LINKED_PAGE_URLS.CLOUDFLARE.IMAGE_ROUTE}&dateStart=${eventStartDate}&dateEnd=${eventEndDate}&location=${this.countryCode}`;
        } else {
            entityLevel = 'AS';
            entityScope = event.asnDetails.location.name;
            entityName = `${event.asnDetails.name} - ${entityScope}`;
            linkedPage = `${API_LINKED_PAGE_URLS.CLOUDFLARE.BASE}/as${event.asnDetails.asn}&dateStart=${eventStartDate}&dateEnd=${eventEndDate}`;
            image = `${API_LINKED_PAGE_URLS.CLOUDFLARE.BASE}/${API_LINKED_PAGE_URLS.CLOUDFLARE.IMAGE_ROUTE}&dateStart=${eventStartDate}&dateEnd=${eventEndDate}&location=as${event.asnDetails.asn}`;
        }

        const dataSource = DATA_SOURCES.CLOUDFLARE;

        const content = `DataSource: ${dataSource}
        Started: ${eventStartedAt}
        Ended: ${eventEndedAt}
        Outage duration ${eventDuration}`;

        // construct guid for de-duplication of reports
        const guid = event.uuid || null;

        if (guid == null) {
            console.error(`\tNo guid or link found in Cloudflare response: ${event}`);
            return;
        }


        return  new SocialMediaPost({
            authoredAt: eventStartedAt,
            fetchedAt: null,
            author: entityName,
            content: content,
            url: linkedPage,
            platform: this.options.media || "Cloudflare",
            platformID: guid,
            raw: {
                'rawEvent': event,
                'entityLevel': entityLevel,
                'entityScope': entityScope,
                'entityName': entityName,
                'dataSource': dataSource,
                'started': eventStartedAt,
                'ended': eventEndedAt,
                'duration': eventDuration,
                'image': image, // Store image as https url
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

module.exports = CloudflareChannel;