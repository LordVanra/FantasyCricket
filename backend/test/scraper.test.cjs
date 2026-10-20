const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const Scraper = require('../datascrape');
const url = 'https://www.espncricinfo.com/series/test-123';
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
  try { await assert.rejects(new Scraper(url).scrape(), /Tournament scraping failed/); }
  finally { axios.get = previous; }
});
