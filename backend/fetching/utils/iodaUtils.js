
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

module.exports = extractCleanSVGFromPage;