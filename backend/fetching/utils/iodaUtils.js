
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');


const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const chartIndexMap = {
    'geoasn-country': '0',
    'geoasn-region': '0',
    'default': '1',
  };


async function extractCleanSVGFromPage(browser, linkedPageUrl, queryType) {


    const page = await browser.newPage();

    try {

        await page.goto(linkedPageUrl, {waitUntil: 'networkidle'});

        const chartIndex = chartIndexMap[queryType] || chartIndexMap['default'];

        await page.waitForSelector(`div[data-highcharts-chart="${chartIndex}"] svg.highcharts-root`, {
            timeout: 30000, 
            state: 'attached',
        });

        const rawSvg = await page.$eval(
            `div[data-highcharts-chart="${chartIndex}"] svg.highcharts-root`, 
            el => el.outerHTML
        );

        const cleanSvg = DOMPurify.sanitize(rawSvg, {USE_PROFILES: {svg: true}});

        return cleanSvg;

    } catch (error) {
        throw new Error(`SVG extraction failed for page: ${linkedPageUrl}. Error: ${error.message}`);
    } finally {
        await page.close();
    }
}

function normalizeScope(value) {
    if (!value) return 'na';
    return String(value).trim().toLowerCase();
}

function normalizeAsn(value) {
    if (!value) return 'na';
    return String(value).trim().toLowerCase();
}

function buildEventAggKeyBase({ asn, geoScope }) {
    const normalizedAsn = this.normalizeAsn(asn);
    const normalizedGeoScope = this.normalizeScope(geoScope);

    return `${normalizedAsn}|${normalizedGeoScope}`;
}

function buildEventIdentifier({ asn, geoScope, outageStartedAt }) {
    const eventAggKeyBase = this.buildEventAggKeyBase({ asn, geoScope });

    if (!outageStartedAt) {
        return `${eventAggKeyBase}|na`;
    }

    const startedAtIso =
        outageStartedAt instanceof Date
            ? outageStartedAt.toISOString()
            : new Date(outageStartedAt).toISOString();

    return `${eventAggKeyBase}|${startedAtIso}`;
}

module.exports = {
    extractCleanSVGFromPage,
    normalizeScope,
    normalizeAsn,
    buildEventAggKeyBase,
    buildEventIdentifier
};