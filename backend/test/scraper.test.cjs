const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const Scraper = require('../datascrape');
const url = 'https://www.espncricinfo.com/series/test-123';
test('report, commentary and scorecard links normalize to one canonical scorecard', () => {
  const scraper = new Scraper(url);
  const match = '/series/test-123/team-a-vs-team-b-1st-match-456';
  for (const suffix of ['', '/', '/match-report', '/full-scorecard', '/ball-by-ball-commentary?innings=1', '/match-photos/extra']) {
    assert.equal(scraper.scorecardUrl(match + suffix), `https://www.espncricinfo.com${match}/full-scorecard`);
  }
  assert.equal(scraper.scorecardUrl('https://other.example' + match), null);
  assert.equal(scraper.scorecardUrl('/series/another-789/team-a-vs-team-b-456/full-scorecard'), null);
  assert.equal(scraper.scorecardUrl('/series/test-123/match-results'), null);
});
test('scorecard failure throws instead of returning empty scores; requests have a timeout', async () => {
  const previous = axios.get;
  axios.get = async (_url, options) => { assert.equal(options.timeout, 30000); throw new Error('network timeout'); };
  try { await assert.rejects(new Scraper(url).scrapeMatch(`${url}/a-vs-b/full-scorecard`), /Scorecard fetch failed/); }
  finally { axios.get = previous; }
});
test('a failed squad request cannot be treated as a valid partial roster', async () => {
  const previous = axios.get;
  axios.get = async () => { throw new Error('network timeout'); };
  try { await assert.rejects(new Scraper(url).scrapeSquads(), /Squad scraping failed/); }
  finally { axios.get = previous; }
});
test('failed tournament fetch cannot be saved as successful empty output', async () => {
  const previous = axios.get;
  axios.get = async () => { throw new Error('network timeout'); };
  try { await assert.rejects(new Scraper(url).scrape(), /Squad scraping failed/); }
  finally { axios.get = previous; }
});

test('preseason squads survive an absent results page, but not server outages', async () => {
  const previous = axios.get;
  const scraper = new Scraper(url);
  scraper.scrapeSquads = async () => ({ Alpha: [{ name: 'Bench Player' }], Beta: [{ name: 'Other Player' }] });
  try {
    axios.get = async () => { throw Object.assign(new Error('not found'), { response: { status: 404 } }); };
    const data = await scraper.scrape();
    assert.equal(data.matches.length, 0); assert.equal(data.squads.Alpha.length, 1);
    axios.get = async () => { throw Object.assign(new Error('unavailable'), { response: { status: 503 } }); };
    await assert.rejects(scraper.scrape(), /Tournament scraping failed/);
  } finally { axios.get = previous; }
});
