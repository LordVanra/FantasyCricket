import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { mutate } from '../src/index.js';
import { emptyLeague, startDraft, pick, trade, actOnTrade, fixtures, playerPoints, finalizeScores, standings, validateLineup } from '../src/domain.js';

const players = Object.fromEntries(Array.from({ length: 66 }, (_, i) => [`P${i}`, { name: `P${i}`, playerType: i % 11 < 4 ? 'batsman' : i % 11 < 8 ? 'bowler' : 'allrounder', batting: [{ matchUrl: 'm1', matchNumber: 1, runs: 10, fours: 1, sixes: 1 }] }]));
const stats = { players, matches: [] };
const alice = { id: 'a', username: 'alice' }, bob = { id: 'b', username: 'bob' };
function league() { const s = emptyLeague('l', 'League', 'CODE', alice); s.members.push(bob); return s; }
function dbAdapter() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const adapter = { prepare(sql) {
    const build = args => ({ bind: (...values) => build(values),
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }) });
    return build([]);
  }, async batch(queries) {
    db.exec('BEGIN');
    try { const result = []; for (const q of queries) result.push(await q.run()); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  } };
  return adapter;
}
test('draft validates turn, player existence and duplicates before changing ownership', () => {
  const s = league(); startDraft(s, 'a', ['a', 'b'], stats);
  assert.throws(() => pick(s, 'b', 'b', 'P1', 0, stats), /turn/);
  assert.throws(() => pick(s, 'a', 'a', 'missing', 0, stats), /Unknown/);
  assert.equal(s.drafted.length, 0);
  pick(s, 'a', 'a', 'P1', 0, stats);
  assert.equal(s.draft.current_pick, 1);
  assert.throws(() => pick(s, 'b', 'b', 'P1', 1, stats), /already drafted/);
  assert.throws(() => pick(s, 'a', 'a', 'P2', 0, stats), /mismatch/);
});
test('trade validates recipient and current ownership; acceptance updates both teams', () => {
  const s = league();
  s.drafted = [{ player_id: 'P1', user_id: 'a' }, { player_id: 'P2', user_id: 'b' }];
  s.teams = { a: { starting_11: ['P1'] }, b: { starting_11: ['P2'] } };
  const t = trade(s, 'a', { receiverId: 'b', offered: ['P1'], requested: ['P2'] });
  assert.throws(() => actOnTrade(s, 'a', t.id, 'accepted'), /authorized/);
  actOnTrade(s, 'b', t.id, 'accepted');
  assert.equal(s.drafted[0].user_id, 'b'); assert.equal(s.drafted[1].user_id, 'a');
  assert.deepEqual(s.teams.a.starting_11, []);
  assert.throws(() => actOnTrade(s, 'b', t.id, 'accepted'), /pending/);
});
test('fielding-only appearances count for scoring', () => {
  assert.equal(playerPoints({ fielding: [{ matchUrl: 'm', matchNumber: 1, catches: 2 }] }, 1).points, 16);
  assert.equal(playerPoints(players.P0, 2).points, 0);
});
test('lineups reject duplicate, unowned and insufficient-role players', () => {
  const s = league(), lineup = Array.from({ length: 11 }, (_, i) => `P${i}`);
  s.drafted = lineup.map(player_id => ({ player_id, user_id: 'a' }));
  assert.doesNotThrow(() => validateLineup(s, 'a', lineup, stats));
  assert.throws(() => validateLineup(s, 'a', Array(11).fill('P0'), stats), /different/);
  assert.throws(() => validateLineup(s, 'b', lineup, stats), /own/);
  const onlyBatsmen = { players: Object.fromEntries(lineup.map(p => [p, { playerType: 'batsman' }])) };
  assert.throws(() => validateLineup(s, 'a', lineup, onlyBatsmen), /bowlers/);
});
test('stale trade cannot transfer a player now owned by someone else', () => {
  const s = league(); s.drafted = [{ player_id: 'P1', user_id: 'a' }, { player_id: 'P2', user_id: 'b' }];
  const t = trade(s, 'a', { receiverId: 'b', offered: ['P1'], requested: ['P2'] });
  s.drafted[0].user_id = 'b';
  assert.throws(() => actOnTrade(s, 'b', t.id, 'accepted'), /ownership changed/);
  assert.equal(t.status, 'pending');
});
test('22 picks per member completes the draft without allowing extra picks', () => {
  const s = league(); startDraft(s, 'a', ['a', 'b'], stats);
  for (let i = 0; i < 44; i++) {
    const id = i % 2 ? 'b' : 'a'; pick(s, id, id, `P${i}`, i, stats);
  }
  assert.equal(s.draft.is_active, false);
  assert.equal(s.drafted.filter(p => p.user_id === 'a').length, 22);
  assert.throws(() => pick(s, 'a', 'a', 'P44', 44, stats), /not active/);
});
test('round robin handles odd teams without self matches', () => {
  const s = league(); s.members.push({ id: 'c', username: 'charlie' });
  fixtures(s, 'a', 3);
  assert.equal(s.matches.length, 3);
  assert.equal(new Set(s.matches.map(m => [m.team_a_id, m.team_b_id].sort().join())).size, 3);
  assert.throws(() => fixtures(s, 'b', 1), /Commissioner/);
});
test('scoring is due-gated, immutable and keeps lineup snapshots', () => {
  const s = league(); fixtures(s, 'a', 1);
  for (const [id, offset] of [['a', 0], ['b', 11]]) {
    const lineup = Array.from({ length: 11 }, (_, i) => `P${offset + i}`);
    s.teams[id] = { starting_11: lineup };
    s.drafted.push(...lineup.map(player_id => ({ player_id, user_id: id })));
  }
  assert.equal(finalizeScores(s, 'a', stats, 0), 0);
  s.matches[0].score_due_at = '2000-01-01T00:00:00Z';
  assert.equal(finalizeScores(s, 'a', stats, 0), 1);
  assert.equal(s.matches[0].team_a_score, 165);
  s.teams.a.starting_11 = [];
  assert.equal(finalizeScores(s, 'a', { players: {} }, 0), 0);
  assert.equal(s.matches[0].breakdowns.a.starting_11.length, 11);
  assert.equal(standings(s)[0].points, 1);
});
test('concurrent database picks commit exactly one winner', async () => {
  const db = dbAdapter(), s = league(); startDraft(s, 'a', ['a', 'b'], stats);
  await db.prepare('INSERT INTO leagues(id,code,state) VALUES(?,?,?)').bind(s.id, s.code, JSON.stringify(s)).run();
  const results = await Promise.allSettled(['P1', 'P2'].map(p => mutate(db, 'l', s => pick(s, 'a', 'a', p, 0, stats))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const saved = JSON.parse((await db.prepare('SELECT state FROM leagues WHERE id=?').bind('l').first()).state);
  assert.equal(saved.drafted.length, 1); assert.equal(saved.draft.current_pick, 1);
});
test('HTTP auth, sessions, server authority, stats upload and logout', async () => {
  const env = { DB: dbAdapter(), AUTH_LIMITER: { limit: async () => ({ success: true }) }, STATS_SYNC_TOKEN: 'test-token' };
  let cookie = '';
  async function request(op, params = {}, extra = {}) {
    const r = await worker.fetch(new Request('https://example.com/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...extra }, body: JSON.stringify({ op, params }) }), env);
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, data: await r.json() };
  }
  assert.equal((await request('getLeagues')).status, 401);
  const credentials = { email: 'alice@fantasy-app.internal', password: 'Password123!' };
  assert.equal((await request('signUp', credentials)).status, 200);
  assert.equal((await request('signUp', credentials)).status, 409);
  assert.equal((await request('signIn', { ...credentials, password: 'wrong-password' })).status, 401);
  assert.equal((await request('signIn', credentials)).status, 200);
  assert.match(cookie, /^fantasy_session=/);
  assert.equal((await request('getUser')).data.username, 'alice');
  await request('getDefaultLeague'); await request('joinLeague', { leagueId: 'default' });
  assert.equal((await request('getLeagues')).data[0].commissioner_id, (await request('getUser')).data.id);
  assert.equal((await request('saveUserTeam', { leagueId: 'default', userId: 'other', starting11: [] })).status, 403);
  assert.equal((await request('getLeagues', {}, { Origin: 'https://evil.example' })).status, 403);
  env.APP_ORIGINS = 'https://fantasycricketgame.vercel.app';
  assert.equal((await request('getLeagues', {}, { Origin: 'https://fantasycricketgame.vercel.app' })).status, 200);
  assert.equal((await request('getLeagues', {}, { Origin: 'https://fantasycricketgame.vercel.app.evil.example' })).status, 403);
  const uploaded = await worker.fetch(new Request('https://example.com/api/admin/stats', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }, body: JSON.stringify(stats) }), env);
  assert.equal(uploaded.status, 200);
  assert.equal(Object.keys((await request('getTournamentStats')).data.players).length, 66);
  await request('signOut'); assert.equal((await request('getUser')).data, null);
});
