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
  scraper.scrapeSchedule = async () => [];
  scraper.scrapeSquads = async () => ({ Alpha: [{ name: 'Bench Player' }], Beta: [{ name: 'Other Player' }] });
  try {
    axios.get = async () => { throw Object.assign(new Error('not found'), { response: { status: 404 } }); };
    const data = await scraper.scrape();
    assert.equal(data.matches.length, 0); assert.equal(data.squads.Alpha.length, 1);
    axios.get = async () => { throw Object.assign(new Error('unavailable'), { response: { status: 503 } }); };
    await assert.rejects(scraper.scrape(), /Tournament scraping failed/);
  } finally { axios.get = previous; }
});

test('squad cards include bench players but exclude leaderboard sidebar links', async () => {
  const previous = axios.get;
  axios.get = async requestUrl => ({ data: requestUrl.endsWith('/squads')
    ? '<a href="/series/test-123/team-alpha-squad-456/series-squads">Alpha</a>'
    : '<div class="ds-relative ds-flex ds-flex-row"><div><a href="/cricketers/bench-bowler-789">Bench Bowler</a><p>Bowler</p><span>Batting: Right hand Bat</span></div></div><aside><a href="/cricketers/sidebar-player-999">Sidebar Player</a></aside>' });
  try {
    const squads = await new Scraper(url).scrapeSquads();
    assert.deepEqual(squads['Team Alpha'], [{ name: 'Bench Bowler', url: '/cricketers/bench-bowler-789', type: 'bowler' }]);
  } finally { axios.get = previous; }
});

test('schedule includes only the selected competition and preserves times, teams and completion', () => {
  const base={series:{objectId:123},objectId:456,slug:'team-a-vs-team-b-1st-match',teams:[{team:{longName:'Alpha'}},{team:{longName:'Beta'}}],startTime:'2027-04-01T14:00:00Z',title:'1st Match',stage:'SCHEDULED'};
  const html='<script id="__NEXT_DATA__">'+JSON.stringify({props:{appPageProps:{data:{content:{matches:[base,{...base,series:{objectId:999}},{...base,objectId:457,title:'Final',stage:'FINISHED'}]}}}}})+'</script>';
  const data=new Scraper(url).parseSchedule(html);
  assert.equal(data.length,2); assert.equal(data[0].completed,false);assert.equal(data[0].startTime,base.startTime);
  assert.deepEqual(data[0].teams,['Alpha','Beta']); assert.equal(data[1].leagueStage,false);assert.equal(data[1].completed,true);
});
