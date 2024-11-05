'use strict'

const aiprediction = require('./models/aiprediction')
// polling for truemedia
// doesnt do anything yet
// https://stackoverflow.com/questions/46208031/polling-until-getting-specific-result
const poll = async function (fn, fnCondition, ms) {
    let result = await fn();
    while (fnCondition(result)) {
        await wait(ms);
        result = await fn();
    }
    return result;
};

const wait = function (ms = 1000) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
};

const apiOptions = {
    method: "POST",
    headers: {
        "X-API-KEY": process.env.TRUEMEDIA_KEY
    }
}
async function resolveMedia(url) {
    const response = await fetch("https://detect.truemedia.org/api/resolve-media", {
        ...apiOptions,
        body: {
            postUrl: url
        }
    });
    if (!response.ok) {
        // 429 is rate limit exceeded
        return { status: response.status }
    }
    const body = await response.json()
    return { status: 200, body };
}

async function getResults(url) {
    const response = await fetch("https://detect.truemedia.org/api/get-results", {
        ...apiOptions,
        body: {
            postUrl: url
        }
    });
    if (!response.ok) {
        return { status: response.status }
    }
    const body = await response.json()
    return { status: 200, body };
}

const timedPolling = async function () {
    while (true) {
        await wait(30000);
        const predictionList = await aiprediction.getUnresolved()
        const prediction = predictionList.find(i => i);

        const response = await resolveMedia(prediction.url);
        if (response.status === 200) {
            await aiprediction.setMedia(prediction._id, response.body);
            if (!!response?.body?.media) {
                for (const media of response?.body?.media) {
                    const results = await getResults(media.url)

                }
            }




        }

    }
};