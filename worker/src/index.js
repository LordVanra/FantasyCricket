import { check, now, emptyLeague, member, commissioner, validateLineup, startDraft, pick, trade, actOnTrade, fixtures, finalizeScores, standings } from './domain.js';

const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async text => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
const publicUser = u => u ? { id: u.id, email: u.email, username: u.username, league_id: u.league_id } : null;
const publicLeague = s => ({ id: s.id, name: s.name, code: s.code, commissioner_id: s.commissioner_id, created_at: s.created_at });
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
async function getLeague(db, id) {
  const row = await stmt(db, 'SELECT state, revision FROM leagues WHERE id = ?', id).first();
  check(row, 'League not found', 404);
  return { ...row, state: JSON.parse(row.state) };
}
export async function mutate(db, id, change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await getLeague(db, id);
    const result = change(row.state);
    const serialized = JSON.stringify(row.state);
    check(enc.encode(serialized).length < 1500000, 'League storage limit reached');
    const updated = await stmt(db, 'UPDATE leagues SET state = ?, revision = revision + 1 WHERE id = ? AND revision = ?', serialized, id, row.revision).run();
    if (updated.meta.changes === 1) return result;
  }
  throw Object.assign(new Error('League changed concurrently. Please retry.'), { status: 409 });
}
async function stats(db) {
  const row = await stmt(db, 'SELECT data FROM tournament_stats WHERE id = 1').first();
  return row ? JSON.parse(row.data) : { players: {}, matches: [], teams: {} };
}
async function defaultLeague(db) {
  const state = emptyLeague('default', 'Default League', 'DEFAULT');
  await stmt(db, 'INSERT OR IGNORE INTO leagues(id, code, state) VALUES (?, ?, ?)', 'default', 'DEFAULT', JSON.stringify(state)).run();
  return publicLeague((await getLeague(db, 'default')).state);
}
async function join(db, user, id) {
  await mutate(db, id, s => {
    if (!s.members.some(m => m.id === user.id)) {
      check(!s.draft && !s.matches.length, 'Membership is locked once drafting or fixtures begin');
      check(s.members.length < 20, 'League is full (20 members maximum)');
      s.members.push({ id: user.id, username: user.username });
      if (!s.commissioner_id) s.commissioner_id = user.id;
    }
  });
  await stmt(db, 'UPDATE users SET league_id = ? WHERE id = ?', id, user.id).run();
  return { ...publicUser(user), league_id: id };
}
async function rpc(db, user, op, p) {
  const actor = user.id;
  if (op === 'getTournamentStats') return stats(db);
  if (op === 'getLeagues') {
    const rows = await stmt(db, 'SELECT state FROM leagues LIMIT 200').all();
    return rows.results.map(r => publicLeague(JSON.parse(r.state)));
  }
  if (op === 'getDefaultLeague' || op === 'createDefaultLeague') return defaultLeague(db);
  if (op === 'getUserProfile') return publicUser(user);
  if (op === 'ensureUserProfile' || op === 'joinLeague') return join(db, user, p.leagueId);
  if (op === 'createLeague') {
    check(typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 80, 'League name must be 1–80 characters');
    const id = crypto.randomUUID(), code = crypto.randomUUID().slice(0, 8).toUpperCase();
    const s = emptyLeague(id, p.name.trim(), code, user);
    await stmt(db, 'INSERT INTO leagues(id, code, state) VALUES (?, ?, ?)', id, code, JSON.stringify(s)).run();
    return publicLeague(s);
  }
  const leagueId = p.leagueId || user.league_id;
  check(leagueId, 'Choose a league first');
  const s = (await getLeague(db, leagueId)).state;
  member(s, actor);
  const userId = p.userId || actor;
  if (op === 'getAllUsers') return s.members;
  if (op === 'getDraftedPlayers') return s.drafted;
  if (op === 'isPlayerDrafted') return s.drafted.some(d => d.player_id === p.playerId);
  if (op === 'getUserTeam') return s.teams[userId] || null;
  if (op === 'getTrades') return s.trades.filter(t => t.sender_id === actor || t.receiver_id === actor);
  if (op === 'getDraftState') return s.draft;
  if (op === 'getDraftChat') return s.chat || [];
  if (op === 'sendDraftChat') {
    check(typeof p.message === 'string' && p.message.trim().length > 0 && p.message.length <= 1000, 'Message must be 1–1000 characters');
    return mutate(db, leagueId, state => {
      member(state, actor);
      check(state.draft?.is_active, 'Chat is only available during an active draft', 409);
      state.chat ||= [];
      const last = [...state.chat].reverse().find(m => m.user_id === actor && m.kind !== 'draft_pick');
      check(!last || Date.now() - Date.parse(last.created_at) >= 2000, 'Please wait two seconds between messages', 429);
      const message = { id: crypto.randomUUID(), user_id: actor, username: user.username, message: p.message.trim(), created_at: now() };
      state.chat.push(message);
      state.chat = state.chat.slice(-100);
      return message;
    });
  }
  if (op === 'getLeagueStandings') return standings(s);
  if (op === 'getFixtures') return s.matches.map(({ breakdowns, ...m }) => ({ ...m,
    team_a_name: s.members.find(u => u.id === m.team_a_id)?.username,
    team_b_name: s.members.find(u => u.id === m.team_b_id)?.username }));
  if (op === 'getMatchTeamBreakdown') {
    const m = s.matches.find(m => m.id === p.matchId);
    check(m?.breakdowns?.[userId], 'Finalized match breakdown not found', 404);
    return { ...m.breakdowns[userId], finalized_at: m.finalized_at, score_due_at: m.score_due_at };
  }
  const tournament = ['startDraft', 'makeDraftPick', 'saveUserTeam', 'updateRoundScores', 'setRoundDueDate'].includes(op) ? await stats(db) : null;
  return mutate(db, leagueId, state => {
    member(state, actor);
    switch (op) {
      case 'startDraft': return startDraft(state, actor, p.turnOrder, tournament);
      case 'makeDraftPick': return pick(state, actor, userId, p.playerId, p.currentPick, tournament);
      case 'setUserAutoDraftMode': {
        check(userId === actor, 'Cannot change another player’s auto draft', 403);
        check(state.draft?.is_active, 'Draft is not active');
        const ids = state.draft.auto_draft_user_ids.filter(id => id !== actor);
        state.draft.auto_draft_user_ids = p.enabled ? [...ids, actor] : ids;
        return state.draft;
      }
      case 'saveUserTeam': {
        check(userId === actor, 'Cannot edit another team', 403);
        check(!state.draft?.is_active, 'Finish drafting before saving a lineup');
        // Once a fixture is due, prevent retroactive lineup edits until scored.
        check(!state.matches.some(m => m.status !== 'completed' && m.score_due_at && Date.parse(m.score_due_at) <= Date.now() && [m.team_a_id, m.team_b_id].includes(actor)), 'A match is due. Ask the commissioner to finalize scores before changing your lineup');
        validateLineup(state, actor, p.starting11, tournament);
        state.teams[actor] = { id: actor, league_id: state.id, starting_11: p.starting11, squad: state.drafted.filter(d => d.user_id === actor).map(d => d.player_id), updated_at: now() };
        return state.teams[actor];
      }
      case 'releasePlayer': {
        check(userId === actor, 'Cannot release another team’s player', 403);
        check(!state.draft?.is_active, 'Cannot release during a draft');
        check(!state.matches.some(m => m.status !== 'completed' && m.score_due_at && Date.parse(m.score_due_at) <= Date.now()), 'Finalize due matches before releasing players');
        check(!state.matches.some(m => m.status !== 'completed' && m.score_due_at) || !state.teams[actor]?.starting_11.includes(p.playerId), 'Save a replacement lineup before releasing a scheduled starter');
        state.drafted = state.drafted.filter(d => !(d.user_id === actor && d.player_id === p.playerId));
        if (state.teams[actor]) state.teams[actor].starting_11 = state.teams[actor].starting_11.filter(n => n !== p.playerId);
        return null;
      }
      case 'proposeTrade': return trade(state, actor, p);
      case 'updateTradeStatus':
      case 'swapPlayers': {
        check(!state.matches.some(m => m.status !== 'completed' && m.score_due_at && Date.parse(m.score_due_at) <= Date.now()), 'Finalize due matches before changing trades');
        if (op === 'swapPlayers' && state.matches.some(m => m.status !== 'completed' && m.score_due_at)) {
          const t = state.trades.find(t => t.id === p.tradeId);
          check(!t || ![[t.sender_id, t.players_offered], [t.receiver_id, t.players_requested]].some(([id, players]) => players.some(p => state.teams[id]?.starting_11.includes(p))), 'Both teams must save replacement lineups before trading scheduled starters');
        }
        return actOnTrade(state, actor, p.tradeId, op === 'swapPlayers' ? 'accepted' : p.newStatus);
      }
      case 'generateFixtures': return fixtures(state, actor, p.rounds);
      case 'updateRoundScores': return finalizeScores(state, actor, tournament, p.ignoredRounds);
      case 'setRoundDueDate': {
        commissioner(state, actor);
        check(!state.draft?.is_active, 'Finish drafting before scheduling scores');
        check(Number.isInteger(p.round) && p.round >= 1, 'Invalid round');
        check(Number.isFinite(Date.parse(p.dueAt)) && Date.parse(p.dueAt) > Date.now(), 'Choose a future deadline');
        const matches = state.matches.filter(m => m.round_number === p.round);
        check(matches.length && matches.every(m => m.status !== 'completed' && (!m.score_due_at || Date.parse(m.score_due_at) > Date.now())), 'Cannot change completed or already-due rounds');
        for (const id of new Set(matches.flatMap(m => [m.team_a_id, m.team_b_id]))) {
          validateLineup(state, id, state.teams[id]?.starting_11 || [], tournament);
        }
        for (const m of matches) m.score_due_at = new Date(p.dueAt).toISOString();
        return matches.length;
      }
      case 'transferCommissioner':
        commissioner(state, actor); member(state, userId); state.commissioner_id = userId; return null;
      case 'kickMember':
        commissioner(state, actor);
        check(userId !== actor, 'Transfer commissioner role first');
        check(!state.draft && !state.matches.length, 'Cannot remove members after drafting or fixtures begin');
        state.members = state.members.filter(m => m.id !== userId);
        return null;
      default: throw Object.assign(new Error('Unknown operation'), { status: 404 });
    }
  });
}
const cookieName = 'fantasy_session';
function cookie(request, token, age) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
function response(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (url.pathname === '/api/health') {
        await stmt(env.DB, 'SELECT 1 FROM users LIMIT 1').first();
        return response({ ok: true, database: 'Cloudflare D1' });
      }
      check(request.method === 'POST', 'Use POST', 405);
      check(request.headers.get('content-type')?.includes('application/json'), 'JSON required', 415);
      const origin = request.headers.get('origin');
      const allowedOrigins = (env.APP_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
      check(!origin || origin === url.origin || allowedOrigins.includes(origin), 'Origin not allowed', 403);
      const raw = await request.text();
      check(enc.encode(raw).length <= (url.pathname === '/api/admin/stats' ? 1800000 : 32768), 'Request too large', 413);
      let body;
      try { body = JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
      check(body && typeof body === 'object' && !Array.isArray(body), 'Invalid request');
      if (url.pathname === '/api/admin/stats') {
        check(env.STATS_SYNC_TOKEN && request.headers.get('authorization') === `Bearer ${env.STATS_SYNC_TOKEN}`, 'Invalid sync credentials', 401);
        check(body.players && typeof body.players === 'object' && Object.keys(body.players).length > 0 && Array.isArray(body.matches), 'Invalid tournament data');
        const previous = await stats(env.DB);
        if (previous.tournament === body.tournament) {
          check(body.matches.length >= (previous.matches || []).length, 'Update would remove existing match results; refusing incomplete scrape', 409);
          const oldTeams = Object.keys(previous.teams || {});
          check(oldTeams.every(team => Object.hasOwn(body.teams || {}, team)), 'Update would remove tournament teams; refusing incomplete scrape', 409);
        }
        if (previous.tournament && previous.tournament !== body.tournament) {
          const leagues = await stmt(env.DB, 'SELECT id FROM leagues WHERE json_extract(state, \'$.draft\') IS NOT NULL OR json_array_length(state, \'$.matches\') > 0 LIMIT 1').first();
          check(!leagues, 'A different tournament cannot replace statistics used by existing drafts or fixtures. Start a fresh database for a new season.', 409);
        }
        await stmt(env.DB, 'INSERT INTO tournament_stats(id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at', JSON.stringify(body), now()).run();
        return response({ ok: true });
      }
      const op = body.op, p = body.params || {};
      if (['signUp', 'signIn'].includes(op)) {
        const limited = await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
        check(limited.success, 'Too many attempts. Try again in a minute.', 429);
        const email = String(p.email || '').trim().toLowerCase();
        check(/^[a-z0-9_\-.]{3,32}@fantasy-app\.internal$/.test(email), 'Username must be 3–32 letters, numbers, dots, dashes or underscores');
        check(typeof p.password === 'string' && p.password.length >= 8 && p.password.length <= 128, 'Password must be 8–128 characters');
        let user = await stmt(env.DB, 'SELECT * FROM users WHERE email = ?', email).first();
        if (op === 'signUp') {
          check(!user, 'Username already exists', 409);
          const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
          const hash = await passwordHash(p.password, salt);
          user = { id: crypto.randomUUID(), email, username: email.split('@')[0], league_id: null };
          try {
            await stmt(env.DB, 'INSERT INTO users(id,email,username,password_hash,salt) VALUES (?,?,?,?,?)', user.id, email, user.username, hash, salt).run();
          } catch (e) { if (String(e).includes('UNIQUE')) check(false, 'Username already exists', 409); throw e; }
          return response({ user: publicUser(user) });
        }
        const hash = await passwordHash(p.password, user?.salt || 'invalid-user-salt');
        check(user && hash === user.password_hash, 'Invalid username or password', 401);
        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        await env.DB.batch([
          stmt(env.DB, 'DELETE FROM sessions WHERE expires_at < ?', Date.now()),
          stmt(env.DB, 'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)', await digest(token), user.id, Date.now() + 7 * 86400000)
        ]);
        return response({ user: publicUser(user) }, 200, { 'Set-Cookie': cookie(request, token, 7 * 86400) });
      }
      const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const hash = token ? await digest(token) : '';
      const user = token ? await stmt(env.DB, 'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?', hash, Date.now()).first() : null;
      if (op === 'getUser') return response(publicUser(user));
      check(user, 'Please sign in again', 401);
      if (op === 'signOut') {
        await stmt(env.DB, 'DELETE FROM sessions WHERE token_hash = ?', hash).run();
        return response(null, 200, { 'Set-Cookie': cookie(request, '', 0) });
      }
      if (op === 'changePassword') {
        check(typeof p.newPassword === 'string' && p.newPassword.length >= 8 && p.newPassword.length <= 128, 'Password must be 8–128 characters');
        const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        await env.DB.batch([
          stmt(env.DB, 'UPDATE users SET salt = ?, password_hash = ? WHERE id = ?', salt, await passwordHash(p.newPassword, salt), user.id),
          stmt(env.DB, 'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', user.id, hash)
        ]);
        return response(null);
      }
      if (op === 'deleteAccount') {
        const rows = await stmt(env.DB, 'SELECT state FROM leagues').all();
        const memberships = rows.results.map(r => JSON.parse(r.state)).filter(s => s.members.some(m => m.id === user.id));
        check(!memberships.some(s => s.commissioner_id === user.id && s.members.length > 1), 'Transfer commissioner role before deleting your account');
        check(!memberships.some(s => s.draft?.is_active || s.matches.some(m => m.status !== 'completed')), 'Finish active drafts and fixtures before deleting your account');
        for (const league of memberships) await mutate(env.DB, league.id, s => {
          check(!s.draft?.is_active && !s.matches.some(m => m.status !== 'completed'), 'League is active', 409);
          s.members = s.members.filter(m => m.id !== user.id);
          s.drafted = s.drafted.filter(d => d.user_id !== user.id);
          delete s.teams[user.id];
          if (s.commissioner_id === user.id) s.commissioner_id = null;
        });
        await stmt(env.DB, 'DELETE FROM users WHERE id = ?', user.id).run();
        return response(null, 200, { 'Set-Cookie': cookie(request, '', 0) });
      }
      return response(await rpc(env.DB, user, op, p) ?? null);
    } catch (e) {
      if (!e.status) console.error(e);
      return response({ error: e.status ? e.message : 'Database request failed. Please retry.' }, e.status || 500);
    }
  }
};
