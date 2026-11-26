'use strict';

const createReportByUrlHandler = ({ Report, getReportSourceAccessFilter, combineReportFilters, sendReportResponse }) => async (req, res) => {
  const url = req.query.url;
  try {
    if (typeof url !== 'string' || url.length > 4096) {
      return res.status(400).send('A valid HTTP(S) URL is required.');
    }
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return res.status(400).send('A valid HTTP(S) URL is required.');
    }
  } catch {
    return res.status(400).send('A valid HTTP(S) URL is required.');
  }

  try {
    const accessFilter = await getReportSourceAccessFilter(req);
    const parsed = new URL(url);
    const status = /^(?:\/[^/]+\/status|\/i\/web\/status)\/(\d+)\/?$/.exec(parsed.pathname);
    const isTwitter = /^(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)$/.test(parsed.hostname);
    // Twitter status IDs identify posts independently of hostname and handle.
    // Some imports use a placeholder handle. Only interpolate validated digits.
    const filter = isTwitter && status
      ? { $or: [
          { url },
          { _media: 'twitter', url: {
            $regex: `^https?://(?:(?:www|mobile)\\.)?(?:x\\.com|twitter\\.com)/(?:[^/?#]+/status|i/web/status)/${status[1]}(?:[/?#]|$)`,
          } },
        ] }
      : { url };
    const report = await Report.findOne(combineReportFilters(filter, accessFilter)).exec();
    if (!report) return res.status(200).json(null);
    return await sendReportResponse(req, res, report, 200, { stripChart: false });
  } catch (err) {
    if (!res.headersSent) return res.status(err.status || 500).send('Unable to look up report.');
  }
};

module.exports = { createReportByUrlHandler };
