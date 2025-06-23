
const { chromium } = require('playwright');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');


const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

async function extractCleanSVGFromPage(linkedPageUrl) {

    const browser = await chromium.launch({headless: true});

    const page = await browser.newPage();

    try {

        await page.goto(linkedPageUrl, {waitUntil: 'networkidle'});

        await page.waitForSelector('svg.highcharts-root', {timeout: 10000});

        const rawSvg = await page.$eval('svg.highcharts-root', el => el.outerHTML);

        const cleanSvg = DOMPurify.sanitize(rawSvg, {USE_PROFILES: {svg: true}});

        await browser.close();

        return cleanSvg;

    } catch (error) {
        await browser.close();
        throw new Error(`SVG extraction failed: ${error.message}`);
    }
}

module.exports = extractCleanSVGFromPage;