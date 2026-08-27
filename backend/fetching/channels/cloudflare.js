

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
const { buildEventAggKeyBase, buildEventIdentifier } = require('../utils/iodaUtils');
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

        this.sourceId = options.sourceId || null;

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

            // Every anomaly Cloudflare returned this fetch. An ongoing report missing from
            // this set is no longer being reported and gets reconciled below — Cloudflare
            // publishes anomalies as UNVERIFIED and withdraws the ones it doesn't confirm,
            // so "no endDate" only means "still running" while it's still being returned.
            const seenGuids = new Set();

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

                seenGuids.add(formattedEvent.platformID);

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
                        existingReport.fetchedAt = formattedEvent.fetchedAt;
                        existingReport.outageEndedAt = formattedEvent.outageEndedAt;
                        existingReport.isOutageOngoing = formattedEvent.isOutageOngoing;
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
                    console.error(`Error processing report for guid ${formattedEvent.platformID}:`, err);
                }


            }

            console.log(`[Fetching-channel-Cloudflare] Success - Parsed and formatted data from url: ${url}, total records: ${events.length}, new records: ${newReportCount}, existed records: ${existedReportCount}, irrelevant region records: ${irrelevantRegionReportCount}.`);
            
            if (affectedGroupIds.size > 0) {
                // console.log(`[Cloudflare] Recomputing duration for ${affectedGroupIds.size} affected incidents`);
                await recomputeIncidentDurationForGroups([...affectedGroupIds]);
            }

            // Only runs on a successful fetch — a failed one leaves seenGuids empty, which
            // would make every healthy ongoing report look withdrawn.
            await this.reconcileOngoingReports(seenGuids);

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
     * Re-query Cloudflare for one anomaly, scoped to its own ASN or location.
     *
     * There is no per-anomaly endpoint, so the best available lookup is a narrow
     * entity-scoped window around the anomaly's start.
     */
    async findAnomalyForReport(report) {
        const rawEvent = report.metadata
            && report.metadata.rawAPIResponse
            && report.metadata.rawAPIResponse.rawEvent;

        if (!rawEvent || !rawEvent.uuid || !rawEvent.startDate) return null;

        const startedAt = new Date(rawEvent.startDate);
        if (Number.isNaN(startedAt.getTime())) return null;

        const dateStart = new Date(startedAt.getTime() - 6 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';
        const dateEnd = new Date(Date.now()).toISOString().split('.')[0] + 'Z';

        const params = new URLSearchParams({
            dateStart,
            dateEnd,
            limit: String(this.fetchResultLimit),
        });

        if (rawEvent.asnDetails && rawEvent.asnDetails.asn) {
            params.append('asn', String(rawEvent.asnDetails.asn));
        } else if (rawEvent.locationDetails && rawEvent.locationDetails.code) {
            params.append('location', String(rawEvent.locationDetails.code));
        }

        const url = new URL(`${API_ROUTES.CLOUDFLARE.TRAFFIC_ANOMALIES}?${params}`, API_BASE_URLS.CLOUDFLARE);
        const apiToken = this.#decryptedSecrets.cloudflareApiToken || null;

        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiToken}` },
        });

        if (!res.ok) {
            throw new Error(`Failed fetching traffic anomalies: ${url} - ${res.status}.`);
        }

        const rawFeed = await res.json();

        if (!rawFeed.success || !rawFeed.result || !Array.isArray(rawFeed.result.trafficAnomalies)) {
            throw new Error(`Failed parsing traffic anomalies data.`);
        }

        return rawFeed.result.trafficAnomalies.find((e) => e.uuid === rawEvent.uuid) || null;
    }

    /**
     * Settle reports still flagged ongoing that Cloudflare stopped returning.
     *
     * Cloudflare publishes anomalies as UNVERIFIED and withdraws the ones it never
     * confirms, so an unconfirmed anomaly keeps a null endDate forever and would read as
     * "ongoing" indefinitely. If it reappears we take its real end; if it is gone we close
     * it at the last time we actually saw it, which is the last moment we can attest to.
     */
    async reconcileOngoingReports(seenGuids) {
        if (!this.sourceId) {
            console.warn('[Fetching-channel-Cloudflare] Skipped - Skipped ongoing reconciliation, no sourceId on channel.');
            return;
        }

        const staleReports = await Report.find({
            _sources: String(this.sourceId),
            isOutageOngoing: true,
            guid: { $nin: [...seenGuids] },
        }).exec();

        if (!staleReports.length) return;

        const affectedGroupIds = new Set();
        let closedWithRealEnd = 0;
        let closedAtLastSeen = 0;
        let stillOngoing = 0;

        for (const report of staleReports) {
            let anomaly = null;

            try {
                anomaly = await this.findAnomalyForReport(report);
            } catch (err) {
                // Can't tell withdrawn from unreachable — leave it for the next poll.
                console.error(`[Fetching-channel-Cloudflare] Failed - Failed reconciliation lookup for guid ${report.guid}.`);
                continue;
            }

            if (anomaly && !anomaly.endDate) {
                // Still running, just outside the 6h fetch window.
                report.fetchedAt = new Date(Date.now());
                await report.save();
                stillOngoing += 1;
                continue;
            }

            const outageEndedAt = anomaly && anomaly.endDate
                ? new Date(anomaly.endDate)
                : report.fetchedAt;

            if (!outageEndedAt) continue;

            report.outageEndedAt = outageEndedAt;
            report.isOutageOngoing = false;

            if (report.metadata && report.metadata.rawAPIResponse) {
                if (anomaly) report.metadata.rawAPIResponse.rawEvent = anomaly;
                report.metadata.rawAPIResponse.ended = outageEndedAt.toISOString();
                report.metadata.rawAPIResponse.isOngoing = false;
                // Flags an end we inferred from the last sighting rather than one
                // Cloudflare reported, so the UI can qualify it if it wants to.
                report.metadata.rawAPIResponse.endInferred = !(anomaly && anomaly.endDate);
                report.markModified('metadata');
            }

            await report.save();

            if (anomaly && anomaly.endDate) closedWithRealEnd += 1;
            else closedAtLastSeen += 1;

            if (report._group) {
                affectedGroupIds.add(report._group.toString());
            }
        }

        console.log(`[Fetching-channel-Cloudflare] Success - Reconciled ongoing reports, stale: ${staleReports.length}, closed with reported end: ${closedWithRealEnd}, closed at last seen: ${closedAtLastSeen}, still ongoing: ${stillOngoing}.`);

        if (affectedGroupIds.size > 0) {
            await recomputeIncidentDurationForGroups([...affectedGroupIds]);
        }
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

        // Cloudflare omits endDate while an anomaly is still running, which is the same
        // "no end yet" state IODA expresses by clamping duration to the query window.
        const isOngoing = !event.endDate;

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
                'isOngoing': isOngoing,
                'image': image, // Store image as https url
            }
        });

        const eventAggKeyBase = buildEventAggKeyBase({
            asn,
            geoScope,
        });
    
        const eventIdentifier = buildEventIdentifier({
            asn,
            geoScope,
            outageStartedAt,
        });

        post.isOutageEvent = isOutageEvent;
        post.isAsnScoped = isAsnScoped;
        post.asn = asn;
        post.outageStartedAt = outageStartedAt;
        post.outageEndedAt = outageEndedAt;
        post.isOutageOngoing = isOngoing;
        post.geoScope = geoScope;
        post.eventAggKeyBase = eventAggKeyBase;
        post.eventIdentifier = eventIdentifier;

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