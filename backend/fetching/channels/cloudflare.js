

const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const { mongoose } = require('../../database');
const { API_BASE_URLS, API_ROUTES, DATA_SOURCES, API_LINKED_PAGE_URLS, API_MAX_RESULTS } = require('../../config/fetching/externalApis');
const { decryptSecretsObject } = require('../utils/decryption');
const {  recomputeIncidentDurationForGroups } = require('../../api/utils/incidentDuration');
const Group = require('../../models/group');
const Report = require('../../models/report');
require('dotenv').config();

const countries = require('i18n-iso-countries');
countries.registerLocale(require('i18n-iso-countries/langs/en.json'))

/**
 * A Channel that polls the RSS feed of a list of URLs.
 */
class CloudflareChannel extends PollChannel {

    
    static INTERVAL = process.env.API_FETCH_INTERVAL || 300000;
    static LIMIT = API_MAX_RESULTS.CLOUDFLARE || 50;

    #decryptedSecrets; // private property of decrypted secrets

    constructor(options) {

        super({...options,
            namespace: options.namespace || `cloudflare-${options.countryCode}`
        }),

        this.options = options;

        this.countryCode = options.countryCode || null;

        this.credentials = options.credentials || null;
        this.#decryptedSecrets = this.credentials?.secrets
            ? decryptSecretsObject(this.credentials.secrets)
            : {};

        this.interval = options.interval || CloudflareChannel.INTERVAL;


        // Fetch time range from 6H ago (or an earlier timestamp if specified) till now
        const fetchToUTCTime = new Date(Date.now());
        const fetchFromUTCTime = options.lastTimestamp
            ? new Date(Math.min(options.lastTimestamp, fetchToUTCTime - 6 * 60 * 60 * 1000))
            : new Date(fetchToUTCTime - 6 * 60 * 60 * 1000);

        this.fetchToTimestamp = fetchToUTCTime.toISOString().split('.')[0] + 'Z'; 
        this.fetchFromTimestamp = fetchFromUTCTime.toISOString().split('.')[0] + 'Z';  
        this.fetchResultLimit = options.fetchResultLimit || CloudflareChannel.LIMIT;
        
    }

    async fetch() {
        
        const outages = [];

        const fetchToUTCTime = new Date(Date.now());
        const fetchFromUTCTime = new Date(Math.min(Date.parse(this.fetchFromTimestamp), fetchToUTCTime - 6 * 60 * 60 * 1000))


        this.fetchToTimestamp = fetchToUTCTime.toISOString().split('.')[0] + 'Z'; 
        this.fetchFromTimestamp = fetchFromUTCTime.toISOString().split('.')[0] + 'Z';  


        // Construct query url
        const url = new URL(API_ROUTES.CLOUDFLARE.TRAFFIC_ANOMALIES, API_BASE_URLS.CLOUDFLARE);
        url.searchParams.append("dateStart", this.fetchFromTimestamp);
        url.searchParams.append("dateEnd", this.fetchToTimestamp);
        url.searchParams.append("limit", this.fetchResultLimit);

        try {
            // Fetch data
            const apiToken = this.#decryptedSecrets.cloudflareApiToken || null;

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
            const affectedGroupIds = new Set();

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

                    const existingReport = await Report.findOne({ guid: formattedEvent.platformID });

                    if (existingReport) {
                        const prevEnd = existingReport.outageEndedAt
                        ? existingReport.outageEndedAt.getTime()
                        : null;
                        const newEnd = formattedEvent.outageEndedAt
                        ? formattedEvent.outageEndedAt.getTime()
                        : null;

                        const endChanged = prevEnd !== newEnd;

                        // update fields
                        existingReport.content = formattedEvent.content;
                        existingReport.url = formattedEvent.url;
                        existingReport.outageEndedAt = formattedEvent.outageEndedAt;
                        // update whole metadata.rawAPIResponse object
                        existingReport.metadata = existingReport.metadata || {};
                        existingReport.metadata.rawAPIResponse = formattedEvent.raw;
                        existingReport.markModified('metadata');


                        await existingReport.save();
                        existedReportCount += 1;

                        if (endChanged && existingReport._group) {
                            affectedGroupIds.add(existingReport._group.toString());
                        }

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
            
            if (affectedGroupIds.size > 0) {
                // console.log(`[Cloudflare] Recomputing duration for ${affectedGroupIds.size} affected incidents`);
                await recomputeIncidentDurationForGroups([...affectedGroupIds]);
            }

        } catch (e) {
            console.error(`[Fetching-channel-Cloudflare] Failed - Failed parsing and formating data: ${this.options.media}.`);
        }

        this.fetchFromTimestamp = this.fetchToTimestamp;
        const updatedTimestamp = new Date(this.fetchFromTimestamp);
        if (typeof this.options?.onFetch === 'function') {
            await this.options.onFetch(updatedTimestamp);
        }

        return outages;

    }


    /**
     * Parse the fetched event data to SocialMediaPost.
     */
    parseEvent(event, matchesLocation) {

        // Enriched attributes
        let entityLevel = null;
        let entityScope = null;
        let entityName = null;
        let isOutageEvent = null;
        let isAsnScoped = null;
        let asn  = null;
        let outageStartedAt = null;
        let outageEndedAt = null;
        let geoScope = null;

        let linkedPage = null;
        let image = null;

        // construct start date
        const startDate = new Date(event.startDate);
        const startHour = startDate.getUTCHours();
        const eventStartedAt = startDate.toISOString();
        outageStartedAt = startDate;

        const urlFromEpoch = new Date(startDate);
        if (startHour < 12) urlFromEpoch.setUTCDate(urlFromEpoch.getUTCDate() - 1);
        urlFromEpoch.setUTCHours(0, 0, 0, 0);
        const urlFromDate = urlFromEpoch.toISOString().slice(0, 10);

        // construct end date
        let endDate = null;
        let eventEndedAt = 'unknown';
        let eventDuration = 'unknown';
        let urlToDate;

        if (event.endDate) {
            endDate = new Date(event.endDate);    
            outageEndedAt = endDate;
            eventEndedAt = endDate.toISOString();
            eventDuration = this.formatDuration(
                Math.floor((endDate - startDate) / 1000)
            );
            urlToDate = eventEndedAt.slice(0, 10); 
        } else {
            const urlToEpoch = new Date(startDate);
            if (startHour >= 12) urlToEpoch.setUTCDate(urlToEpoch.getUTCDate() + 1);
            urlToEpoch.setUTCHours(0, 0, 0, 0);
            urlToDate = urlToEpoch.toISOString().slice(0, 10);            
        }  
        

        if (matchesLocation) {
            isOutageEvent = true;
            isAsnScoped = false;

            entityLevel = 'Country';
            entityScope = countries.getName(this.countryCode, "en") || this.countryCode;
            geoScope = entityScope;
            entityName = `${entityLevel} - ${entityScope}`;
            linkedPage = `${API_LINKED_PAGE_URLS.CLOUDFLARE.BASE}/${event.locationDetails.code}?dateStart=${urlFromDate}&dateEnd=${urlToDate}`;
            image = `${API_LINKED_PAGE_URLS.CLOUDFLARE.BASE}/${API_LINKED_PAGE_URLS.CLOUDFLARE.IMAGE_ROUTE}&dateStart=${urlFromDate}&dateEnd=${urlToDate}&location=${this.countryCode}`;
        } else {
            isOutageEvent = true;
            isAsnScoped = true;
            asn = `as${event.asnDetails.asn}`;

            entityLevel = 'AS';
            entityScope = countries.getName(this.countryCode, "en") || this.countryCode;
            geoScope = entityScope;
            entityName = `${event.asnDetails.name} - ${entityScope}`;
            linkedPage = `${API_LINKED_PAGE_URLS.CLOUDFLARE.BASE}/as${event.asnDetails.asn}?dateStart=${urlFromDate}&dateEnd=${urlToDate}`;
            image = `${API_LINKED_PAGE_URLS.CLOUDFLARE.BASE}/${API_LINKED_PAGE_URLS.CLOUDFLARE.IMAGE_ROUTE}&dateStart=${urlFromDate}&dateEnd=${urlToDate}&location=as${event.asnDetails.asn}`;
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


        const post = new SocialMediaPost({
            authoredAt: eventStartedAt,
            fetchedAt: null,
            isOutageEvent: isOutageEvent,
            isAsnScoped: isAsnScoped,
            asn: asn,
            outageStartedAt: outageStartedAt,
            outageEndedAt: outageEndedAt,
            geoScope: geoScope,
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

        post.isOutageEvent = isOutageEvent;
        post.isAsnScoped = isAsnScoped;
        post.asn = asn;
        post.outageStartedAt = outageStartedAt;
        post.outageEndedAt = outageEndedAt;
        post.geoScope = geoScope;
        
        return post;

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