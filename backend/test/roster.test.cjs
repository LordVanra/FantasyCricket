const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Processor = require('../processPlayers');
function processFixture(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-roster-'));
  const input = path.join(dir, 'data.json');
  try { fs.writeFileSync(input, JSON.stringify(data)); return new Processor(input).processData(); }
  finally { fs.unlinkSync(input); fs.rmdirSync(dir); }
}
const squads = {
  'Team Alpha': [{ name: 'Alex Smith', url: '/cricketers/alex-smith-123', type: 'Batter' }, { name: 'Ben Smith', url: '/cricketers/ben-smith-456', type: 'Bowler' }],
  'Team Beta': [{ name: 'Casey Jones', url: '/cricketers/casey-jones-789', type: 'Allrounder' }]
};
test('full competition squads create teams and zero-stat players without any matches', () => {
  const data = processFixture({ url: 'https://www.espncricinfo.com/series/ipl-2027-123', matches: [], squads });
  assert.equal(data.season, '2027'); assert.equal(data.totalMatches, 0);
  assert.deepEqual(Object.keys(data.teams), ['Team Alpha', 'Team Beta']);
  assert.equal(Object.keys(data.players).length, 3);
  for (const player of Object.values(data.players)) {
    assert.equal(player.totalRuns, 0); assert.equal(player.totalWickets, 0);
    assert.deepEqual(player.matches, []); assert.deepEqual(player.batting, []);
    assert.ok(player.team);
  }
  assert.equal(data.players['Alex Smith'].playerType, 'batsman');
  assert.equal(data.players['Ben Smith'].playerType, 'bowler');
  assert.equal(data.players['Casey Jones'].playerType, 'allrounder');
});
test('match stats attach to roster identity without removing teammates who have not played', () => {
  const data = processFixture({ url: 'https://www.espncricinfo.com/series/ipl-2027-123', squads, matches: [{ url: 'https://www.espncricinfo.com/series/ipl-2027-123/team-alpha-vs-team-beta-1st-match-999/full-scorecard', matchDate: '2027-04-01', batting: [{ player: 'Alex Smith', url: '/cricketers/alex-smith-123', runs: '42', balls: '30', fours: '4', sixes: '1' }], bowling: [], fielding: [] }] });
  assert.equal(Object.keys(data.players).length, 3);
  assert.equal(data.players['Alex Smith'].totalRuns, 42);
  assert.equal(data.players['Ben Smith'].totalRuns, 0);
  assert.equal(data.players['Ben Smith'].team, 'Team Alpha');
  assert.equal(data.players['Casey Jones'].matches.length, 0);
});
