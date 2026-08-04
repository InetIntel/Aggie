const expect = require('chai').expect;
const OONIChannel = require('../../backend/fetching/channels/ooni');
const Report = require('../../backend/models/report');

describe('OONI channel', function() {
  it('creates a report from mocked OONI data', async function() {
    const originalExists = Report.exists;
    Report.exists = async () => false;

    const queued = [];

    const channel = new OONIChannel({
      asns: '44244',
      fetchDailyMeasurements: async () => [
        { measurement_start_day: '2026-08-03', measurement_count: 0 },
      ],
    });

    channel.enqueue = (post) => queued.push(post);

    try {
      const posts = await channel.fetch();

      expect(posts).to.have.length(1);
      expect(queued).to.have.length(1);
      expect(posts[0].platform).to.equal('OONI');
      expect(posts[0].platformID).to.match(/^ooni:44244:volume:/);
    } finally {
      Report.exists = originalExists;
    }
  });
});