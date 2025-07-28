
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');


const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

async function extractCleanSVGFromPage(browser, linkedPageUrl) {


    const page = await browser.newPage();

    try {

        await page.goto(linkedPageUrl, {waitUntil: 'networkidle'});

        await page.waitForSelector('svg.highcharts-root', {timeout: 30000, state: 'attached',});

        const rawSvg = await page.$eval('svg.highcharts-root', el => el.outerHTML);

        const cleanSvg = DOMPurify.sanitize(rawSvg, {USE_PROFILES: {svg: true}});

        return cleanSvg;

    } catch (error) {
        throw new Error(`SVG extraction failed for page: ${linkedPageUrl}. Error: ${error.message}`);
    } finally {
        await page.close();
    }
}

module.exports = extractCleanSVGFromPage;