const { PollChannel } = require('downstream');
const { default: SocialMediaPost } = require('downstream/build/builtin/post');
const REGION_CODES = require('../../config/fetching/channels/iodaMappings');
const { API_BASE_URLS, API_ROUTES, DATA_SOURCES, API_LINKED_PAGE_URLS } = require('../../config/fetching/externalApis');
const {
    fetchSignals,
    buildEventAggKeyBase,
    buildEventIdentifier
} = require('../utils/iodaUtils');
const {  recomputeIncidentDurationForGroups } = require('../../api/utils/incidentDuration');
const Group = require('../../models/group');
const Report = require('../../models/report');
const countries = require('i18n-iso-countries');
require('dotenv').config();

countries.registerLocale(require('i18n-iso-countries/langs/en.json'))

/**
 * A Channel that polls the Ioda Outages of configured country code.
 */
class IODAChannel extends PollChannel {


    static INTERVAL = process.env.API_FETCH_INTERVAL || 300000;

    static ONGOING_EDGE_TOLERANCE_SECONDS = 60;


    constructor(options) {
        super({...options,
            namespace: options.namespace || `ioda-${options.countryCode}`,
        });

        this.options = options;

        this.queryTypes = ['region', 'geoasn-region', 'geoasn-country', 'asn-country']

        this.metadataUrl = `${API_BASE_URLS.IODA}${API_ROUTES.IODA.ENTITY_QUERY}`;

        this.countryCode = options.countryCode || null;

        this.sourceId = options.sourceId || null;

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

    /**
     * Build the outage-events query url for a queryType over an explicit window.
     */
    buildEventsUrl(queryType, fromTimestamp, untilTimestamp) {
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
        } else if (queryType === 'asn-country') {
            url.searchParams.append('entityType', 'asn');
            url.searchParams.append('relatedTo', `country/${this.countryCode}`);
        }

        url.searchParams.append('from', fromTimestamp);
        url.searchParams.append('until', untilTimestamp);

        return url;
    }

    /**
     * Fetch raw outage events for a queryType over an explicit window.
     */
    async fetchEvents(queryType, fromTimestamp, untilTimestamp) {
        const url = this.buildEventsUrl(queryType, fromTimestamp, untilTimestamp);

        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Failed fetching data: ${url} - ${res.status}.`);
        }

        const rawFeed = await res.json();

        return {
            url,
            events: rawFeed.data || [],
            fetchedAt: new Date(rawFeed.metadata.responseTime) || new Date(Date.now()),
        };
    }

    buildGuid(queryType, event) {
        return `${queryType}-${event.start}-${event.location}-${event.datasource}`;
    }

    /**
     * Recover the queryType a report was built under from its guid.
     */
    queryTypeFromGuid(guid) {
        return this.queryTypes.find((queryType) => String(guid).startsWith(`${queryType}-`)) || null;
    }

    async fetchEventsForEntity(entityType, entityCode, fromTimestamp, untilTimestamp) {
        const url = new URL(API_ROUTES.IODA.OUTAGE_EVENTS, API_BASE_URLS.IODA);

        url.searchParams.append('entityType', entityType);
        url.searchParams.append('entityCode', entityCode);
        url.searchParams.append('from', fromTimestamp);
        url.searchParams.append('until', untilTimestamp);

        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Failed fetching data: ${url} - ${res.status}.`);
        }

        const rawFeed = await res.json();

        return rawFeed.data || [];
    }

    /**
     * Locate the IODA event backing a report via a targeted per-entity query.
     */
    async findEventForReport(report) {
        const rawEvent = report.metadata
            && report.metadata.rawAPIResponse
            && report.metadata.rawAPIResponse.rawEvent;

        if (!rawEvent || !rawEvent.location) return null;

        const slashIdx = String(rawEvent.location).indexOf('/');
        if (slashIdx === -1) return null;

        const entityType = String(rawEvent.location).slice(0, slashIdx);
        const entityCode = String(rawEvent.location).slice(slashIdx + 1);
        if (!entityType || !entityCode) return null;

        const from = report.outageStartedAt
            ? Math.floor(report.outageStartedAt.getTime() / 1000) - 60 * 60
            : this.fetchToTimestamp - 24 * 60 * 60;

        try {
            const events = await this.fetchEventsForEntity(entityType, entityCode, from, this.fetchToTimestamp);

            return events.find((e) => e.start === rawEvent.start && e.datasource === rawEvent.datasource) || null;
        } catch (e) {
            console.error(`[Fetching-channel-IODA] Failed - Failed targeted lookup for entity: ${rawEvent.location}.`);
            return null;
        }
    }

    /**
     * Refresh a still-running report whose event dropped out of the broad listings, so
     * its content, chart window and "updated" time keep moving.
     */
    async refreshOngoingReport(report, event) {
        const queryType = this.queryTypeFromGuid(report.guid);
        if (!queryType) return;

        const formattedEvent = await this.parseEvent(event, queryType, { withChart: false });
        if (!formattedEvent) return;

        const previousChart = report.metadata
            && report.metadata.rawAPIResponse
            && report.metadata.rawAPIResponse.chart;

        report.content = formattedEvent.content;
        report.url = formattedEvent.url;
        report.fetchedAt = new Date(this.fetchToTimestamp * 1000);

        report.metadata = report.metadata || {};
        report.metadata.rawAPIResponse = formattedEvent.raw;
        if (previousChart) {
            report.metadata.rawAPIResponse.chart = previousChart;
        }
        report.markModified('metadata');

        await report.save();
    }

    /**
     * An event is still running if its end reaches the edge of the query window.
     * See ONGOING_EDGE_TOLERANCE_SECONDS.
     */
    isOngoingEvent(eventEndedAtSeconds) {
        return eventEndedAtSeconds >= this.fetchToTimestamp - IODAChannel.ONGOING_EDGE_TOLERANCE_SECONDS;
    }

    async fetch() {
        const outages = [];

        // update fetchTo timestamp for each fetch
        this.fetchToTimestamp = Math.floor(Date.now() / 1000);
        this.fetchFromTimestamp = Math.min(this.fetchFromTimestamp, this.fetchToTimestamp - 2 * 60 * 60);

        // Every event IODA returned this fetch, whether or not it became a report.
        // Reports still flagged ongoing but absent from this set have dropped out of
        // the fetch window and are reconciled below.
        const seenGuids = new Set();
        let allQueriesSucceeded = true;

        for (const queryType of this.queryTypes) {
            try {
                const { url, events, fetchedAt } = await this.fetchEvents(
                    queryType,
                    this.fetchFromTimestamp,
                    this.fetchToTimestamp
                );

                // Declare regex rule to exclude AS-region reports unrelated to the queried country
                let regexRegion = null;
                if (queryType === 'geoasn-region') {
                    regexRegion = /(\d+)-(\d+)/;
                }

                let newReportCount = 0;
                let existedReportCount = 0;
                let irrelevantRegionReportCount = 0;
                let ongoingReportCount = 0;

                const affectedGroupIds = new Set();

                // Parse and transform each event
                for (const event of events) {

                    const guid = this.buildGuid(queryType, event);
                    seenGuids.add(guid);

                    // Exclude irrelevant region event
                    if (regexRegion) {
                            const match = event.location && event.location.match(regexRegion);

                            if (!match || (match && !this.regionCodes[match[2]])) {
                                irrelevantRegionReportCount += 1;
                                continue;
                            };
                    }

                    // De-duplicate fetched report for downstream tasks
                    try {
                        const existingReport = await Report.findOne({ guid });

                        // Fetching the signal series is a lightweight API call, but a closed
                        // outage's chart can never change again, so only pay for it on first
                        // ingest and while the outage is still running.
                        const withChart = !existingReport || existingReport.isOutageOngoing;

                        const formattedEvent = await this.parseEvent(event, queryType, { withChart });

                        if (!formattedEvent) {
                            console.error(`\tFailed parsing formattedEvent: ${JSON.stringify(event)}.`);
                            continue;
                        }

                        formattedEvent.fetchedAt = fetchedAt;

                        if (formattedEvent.isOutageOngoing) {
                            ongoingReportCount += 1;
                        }

                        if (existingReport) {
                            const prevEnd = existingReport.outageEndedAt
                            ? existingReport.outageEndedAt.getTime()
                            : null;
                            const newEnd = formattedEvent.outageEndedAt
                            ? formattedEvent.outageEndedAt.getTime()
                            : null;

                            // While an outage is ongoing both ends are null, so this stays
                            // false and the incident is no longer recomputed on every poll.
                            const endChanged = prevEnd !== newEnd;

                            // Carried over when we skip the signals fetch, so the wholesale
                            // rawAPIResponse replacement below doesn't drop the stored chart.
                            const previousChart = existingReport.metadata
                                && existingReport.metadata.rawAPIResponse
                                && existingReport.metadata.rawAPIResponse.chart;

                            // update fields
                            existingReport.content = formattedEvent.content;
                            existingReport.url = formattedEvent.url;
                            // fetchedAt is what the UI shows as "updated"
                            existingReport.fetchedAt = formattedEvent.fetchedAt;
                            existingReport.outageEndedAt = formattedEvent.outageEndedAt;
                            existingReport.isOutageOngoing = formattedEvent.isOutageOngoing;
                            // update whole metadata.rawAPIResponse object
                            existingReport.metadata = existingReport.metadata || {};
                            existingReport.metadata.rawAPIResponse = formattedEvent.raw;
                            if (!withChart && previousChart) {
                                existingReport.metadata.rawAPIResponse.chart = previousChart;
                            }
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

                console.log(`[Fetching-channel-IODA] Success - Parsed and formatted data from url: ${url}, total records: ${events.length}, new records: ${newReportCount}, existed records: ${existedReportCount}, ongoing records: ${ongoingReportCount}, irrelevant region records: ${irrelevantRegionReportCount}.`);

                if (affectedGroupIds.size > 0) {
                    // console.log(`[IODA] Recomputing duration for ${affectedGroupIds.size} affected incidents`);
                    await recomputeIncidentDurationForGroups([...affectedGroupIds]);
                }

            } catch (e) {
                allQueriesSucceeded = false;
                console.error(`[Fetching-channel-IODA] Failed - Failed parsing and formating data: ${this.options.media} - ${queryType}.`);
            }
        }

        // A failed query leaves seenGuids incomplete, which would make healthy ongoing
        // reports look stale. Only reconcile when we have the full picture.
        if (allQueriesSucceeded) {
            await this.reconcileOngoingReports(seenGuids);
        } else {
            console.warn('[Fetching-channel-IODA] Skipped - Skipped ongoing reconciliation, at least one query failed.');
        }

        // update latestReportDate
        this.fetchFromTimestamp = this.fetchToTimestamp;
        const updatedTimestamp = new Date(this.fetchFromTimestamp * 1000);
        if (typeof this.options?.onFetch === 'function') {
            await this.options.onFetch(updatedTimestamp);
        }

        return outages;
    }

    /**
     * Close out reports still flagged ongoing whose event IODA no longer returns.
     *
     * The steady-state fetch window is only 2 hours wide, so an outage that IODA
     * finalizes late can slide out of it while still flagged ongoing and would
     * otherwise read as "Present" forever. Re-query each queryType over the full span
     * of the stale outages to pick up their finalized duration.
     */
    async reconcileOngoingReports(seenGuids) {
        if (!this.sourceId) {
            console.warn('[Fetching-channel-IODA] Skipped - Skipped ongoing reconciliation, no sourceId on channel.');
            return;
        }

        const staleReports = await Report.find({
            _sources: String(this.sourceId),
            isOutageOngoing: true,
            guid: { $nin: [...seenGuids] },
        }).exec();

        if (!staleReports.length) {
            return;
        }

        // The oldest still-open outage bounds how far back we need to re-query.
        let earliestStart = this.fetchToTimestamp;
        for (const report of staleReports) {
            if (!report.outageStartedAt) continue;
            const startedAt = Math.floor(report.outageStartedAt.getTime() / 1000);
            if (startedAt < earliestStart) earliestStart = startedAt;
        }

        const finalizedByGuid = new Map();
        for (const queryType of this.queryTypes) {
            try {
                const { events } = await this.fetchEvents(queryType, earliestStart, this.fetchToTimestamp);
                for (const event of events) {
                    finalizedByGuid.set(this.buildGuid(queryType, event), event);
                }
            } catch (e) {
                // An incomplete picture would strand reports; retry on the next poll.
                console.error(`[Fetching-channel-IODA] Failed - Failed reconciliation query: ${queryType}.`);
                return;
            }
        }

        const affectedGroupIds = new Set();
        let closedCount = 0;
        let refreshedCount = 0;

        for (const report of staleReports) {

            const event = finalizedByGuid.get(report.guid) || await this.findEventForReport(report);

            if (!event) continue;

            const eventEndedAtSeconds = event.start + event.duration;

            if (this.isOngoingEvent(eventEndedAtSeconds)) {

                await this.refreshOngoingReport(report, event);
                refreshedCount += 1;
                continue;
            }

            const outageEndedAt = new Date(eventEndedAtSeconds * 1000);

            report.outageEndedAt = outageEndedAt;
            report.isOutageOngoing = false;
            report.fetchedAt = new Date(this.fetchToTimestamp * 1000);

            if (report.metadata && report.metadata.rawAPIResponse) {
                report.metadata.rawAPIResponse.rawEvent = event;
                report.metadata.rawAPIResponse.ended = outageEndedAt.toISOString();
                report.metadata.rawAPIResponse.duration = this.formatDuration(event.duration);
                report.metadata.rawAPIResponse.isOngoing = false;
                report.markModified('metadata');
            }

            await report.save();
            closedCount += 1;

            if (report._group) {
                affectedGroupIds.add(report._group.toString());
            }
        }

        console.log(`[Fetching-channel-IODA] Success - Reconciled ongoing reports, stale: ${staleReports.length}, closed: ${closedCount}, still ongoing: ${refreshedCount}, unresolved: ${staleReports.length - closedCount - refreshedCount}.`);

        if (affectedGroupIds.size > 0) {
            await recomputeIncidentDurationForGroups([...affectedGroupIds]);
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
    async parseEvent(event, queryType, { withChart = true } = {}) {

        // Enriched attributes
        let entityLevel = null;
        let entityScope = null;
        let entityName = null;
        let match = null;
        let isOutageEvent = null;
        let isAsnScoped = null;
        let asn  = null;
        let outageStartedAt = null;
        let outageEndedAt = null;
        let geoScope = null;

        let linkedPage = null;
        let chart = null;


        // Extract event timing
        const eventStartedAtSeconds = event.start;
        const eventDurationAtSeconds = event.duration;
        const eventEndedAtSeconds = eventStartedAtSeconds + eventDurationAtSeconds;

        // For an ongoing outage `duration` only runs up to the query window edge, so
        // there is no end time to record yet, only the elapsed time so far.
        const isOngoing = this.isOngoingEvent(eventEndedAtSeconds);

        const eventStartedAt = new Date(eventStartedAtSeconds * 1000).toISOString();
        const eventEndedAt = isOngoing ? null : new Date(eventEndedAtSeconds * 1000).toISOString();
        const eventDuration = this.formatDuration(eventDurationAtSeconds);
        outageStartedAt = new Date(eventStartedAtSeconds * 1000);
        outageEndedAt = isOngoing ? null : new Date(eventEndedAtSeconds * 1000);

        // Construct content
        const dataSource = DATA_SOURCES.IODA[event.datasource];
        const content = `DataSource: ${dataSource}
        Score: ${event.score}
        Started: ${eventStartedAt}
        Ended: ${isOngoing ? 'Present (ongoing)' : eventEndedAt}
        Outage duration ${eventDuration}${isOngoing ? ' so far' : ''}`;

        // Render dashboard
        const urlFromTime = eventStartedAtSeconds - 4 * 60 * 60;
        const urlToTime = Math.min(
            Math.max(
                eventEndedAtSeconds + 4 * 60 * 60, 
                urlFromTime + 24 * 60 * 60
            ), 
            this.fetchToTimestamp
        );
        let entityCode = event.location;

        if (queryType === 'geoasn-region' || queryType === 'geoasn-country') {
            entityCode = entityCode.substring(3);
        }
        linkedPage = `${API_LINKED_PAGE_URLS.IODA.BASE}/${entityCode}?from=${urlFromTime}&until=${urlToTime}`;
        
        const guid = this.buildGuid(queryType, event);
        if (!guid) {
            console.error(`\tNo guid or link found in Ioda response: ${event}`);
            return;
        }

        if (queryType.startsWith('geoasn')) {
            isOutageEvent = true;
            isAsnScoped = true;
            asn = this.extractAsnFromEventLocation(event.location);

            match = event.location_name.match(/^(.+?) -- (.+)$/)
            if (queryType === 'geoasn-region') {
                entityLevel = 'AS - Region';
                entityScope = match[2];
                geoScope = entityScope;
            } else {
                entityLevel = 'AS - Country'
                entityScope = countries.getName(this.countryCode, "en") || this.countryCode;
                geoScope = entityScope;
            }
            entityName = `${match[1]} - ${entityScope}`;
        } else if (queryType === 'asn-country') {
            isOutageEvent = true;
            isAsnScoped = true;
            asn = this.extractAsnFromEventLocation(event.location);
             
            match = event.location_name.match(/^(AS[\w\d]+) \((.+)\)$/);
            entityLevel = 'AS';
            entityScope = countries.getName(this.countryCode, "en") || this.countryCode;
            entityName = `${match?.[2] ?? ' '} - ${entityScope}`;
            geoScope = entityScope;
        } else {
            isOutageEvent = true;
            isAsnScoped = false;

            entityLevel = 'Region';
            entityScope = event.location_name;
            entityName = `${entityLevel} - ${entityScope}`;
            geoScope = entityScope;
        }

        if (withChart) {
            // Signals use the canonical entity path `event.location` (e.g. "region/1843",
            // "asn/34918", "geoasn/47262-IR"). Note this differs from `entityCode` above: the
            // dashboard LINK strips the "geo" prefix for geoasn routing, but the signals API
            // rejects that stripped form (500) and wants the un-stripped location. Same window
            // as the "view on IODA" link, so the chart spans the range the dashboard shows.
            try {
                chart = await fetchSignals({
                    entity: event.location,
                    from: urlFromTime,
                    until: urlToTime,
                });
            } catch (err) {
                console.error(`Error fetching IODA signals for ${event.location}:`, err);
                chart = null;
            }
        }

        const post =  new SocialMediaPost({
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
                'ended': eventEndedAt, // null while the outage is still running
                'duration': eventDuration,
                'isOngoing': isOngoing,
                'chart': chart, // compact signal series for client-side recharts (see fetchSignals)

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

    extractAsnFromEventLocation(eventLocation) {
        if (!eventLocation || typeof eventLocation !== 'string') return null;
        const slashIdx = eventLocation.indexOf('/');
        if (slashIdx === -1) return null;
        const rest = eventLocation.substring(slashIdx + 1); 
        const dashIdx = rest.indexOf('-');
        const numStr = dashIdx === -1 ? rest : rest.substring(0, dashIdx);
        return 'as' + numStr;
    }


}



module.exports = IODAChannel;
