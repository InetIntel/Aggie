process.title = 'aggie';
const processManager = require('./backend/process-manager');

require('dotenv').config();

// fork child at specific module path
function _fork(name, modulePath) {
  const childProcess = processManager.fork(modulePath);
  console.debug('\x1b[36m', `[${name}] started`, '\x1b[0m')
}



// handle uncaught exceptions
process.on('uncaughtException', function (err) {
  console.error(err.message)
  console.debug(err.stack)

});

// Begins the three main backend processes API, fetching, and analytics.
// See Readme files in backend subdirectores for more on each.
_fork('API', '/backend/api');
_fork('FETCH', '/backend/fetching');
_fork('ANALYTICS', '/backend/analytics');
// truemedia polling
_fork('TRUEMEDIA', '/backend/truemedia');
module.exports = processManager;
