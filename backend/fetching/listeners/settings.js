// Registers listeners for Aggie settings events

const downstream = require('../downstream');
const childProcess = require('../../child-process');

function registerListeners() {
    // this path is relative to the child - process.js file.
    const emitter = childProcess.setupEventProxy({
        emitter: './api/settings-handler',
        emitterModule: 'api'
    });
    emitter.on('fetching:start', onFetchingStart);
    emitter.on('fetching:stop', onFetchingStop);
    emitter.on('settingsUpdated', onSettingsUpdated);
}

// fetching:start
async function onFetchingStart() {
    console.log('[debugging-global fetching] Received event-fetching:start')
    await downstream.start((_, channel) => channel.enabled);
}

// fetching:stop
async function onFetchingStop() {
    console.log('[debugging-global fetching] Received event-fetching:stop')
    await downstream.stop((_, channel) => channel.enabled);
}

// settingsUpdated
function onSettingsUpdated() {
    config.get({ reload: true });
}

module.exports = registerListeners;
