'use strict'
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

const checkpolling = async function (fn, fnCondition, ms) {
    while (fnCondition(result)) {
        await wait(30000);
        result = await fn();



    }
};