export function check(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export const now = () => new Date().toISOString();
export const member = (s, id) => check(s.members.some(m => m.id === id), 'Join this league first', 403);
export const commissioner = (s, id) => check(s.commissioner_id === id, 'Commissioner access required', 403);
export function emptyLeague(id, name, code, creator) {
  return { id, name, code, commissioner_id: creator?.id || null, created_at: now(),
    members: creator ? [{ id: creator.id, username: creator.username }] : [],
    drafted: [], teams: {}, trades: [], matches: [], draft: null, ignored_rounds: 0 };
}
export function validateLineup(s, userId, lineup, stats) {
  check(Array.isArray(lineup) && lineup.length === 11 && new Set(lineup).size === 11, 'Select 11 different players');
  const owned = s.drafted.filter(p => p.user_id === userId).map(p => p.player_id);
  check(lineup.every(p => owned.includes(p)), 'Lineup contains a player you do not own');
  const roles = lineup.map(p => stats.players?.[p]?.playerType?.toLowerCase());
  check(roles.filter(r => r === 'batsman').length >= 4 && roles.filter(r => r === 'bowler').length >= 4 && roles.filter(r => r === 'allrounder').length >= 2,
    'Lineup needs at least 4 batsmen, 4 bowlers and 2 allrounders');
}
export function ensureDefaultLineups(s, stats) {
  for (const {id} of s.members) {
    if (s.teams[id]?.starting_11?.length) continue;
    const owned = [...new Set(s.drafted.filter(d=>d.user_id===id).map(d=>d.player_id))];
    const selected=[];
    for (const [role,count] of [['batsman',4],['bowler',4],['allrounder',2]]) {
      selected.push(...owned.filter(n=>stats.players?.[n]?.playerType?.toLowerCase()===role).slice(0,count));
    }
    selected.push(...owned.filter(n=>!selected.includes(n)).slice(0,11-selected.length));
    try { validateLineup(s,id,selected,stats); } catch { continue; }
    s.teams[id]={...s.teams[id],id,league_id:s.id,starting_11:selected,squad:owned,auto_generated:true,updated_at:now()};
  }
}
export function startDraft(s, actor, order, stats) {
  commissioner(s, actor);
  check(!s.gameweeks?.length, 'A gameweek season already exists; drafting cannot be restarted');
  check(!s.draft?.is_active, 'A draft is already active');
  check(!s.matches.some(m => m.status === 'completed'), 'Cannot reset squads after scores have been finalized');
  check(Array.isArray(order) && order.length >= 2 && order.length === s.members.length && new Set(order).size === order.length && order.every(id => s.members.some(m => m.id === id)), 'Draft order must contain every member exactly once');
  check(Object.keys(stats.players || {}).length >= order.length * 15, 'Not enough tournament players for 15-player squads');
  s.drafted = []; s.teams = {}; s.trades = []; s.chat = [];
  s.draft = { league_id: s.id, is_active: true, current_pick: 0, turn_order: order, picks: [], auto_draft_user_ids: [], turn_start_time: now() };
  return s.draft;
}
export function pick(s, actor, target, player, expected, stats) {
  member(s, actor);
  const d = s.draft;
  check(d?.is_active, 'Draft is not active');
  check(d.current_pick < d.turn_order.length * 15, 'Draft is complete');
  check(d.current_pick === expected, 'Pick mismatch: another client already picked', 409);
  check(d.turn_order[d.current_pick % d.turn_order.length] === target, 'Not this player’s turn', 409);
  check(actor === target || d.auto_draft_user_ids.includes(target), 'Only the current player can pick', 403);
  check(Object.hasOwn(stats.players || {}, player), 'Unknown tournament player');
  check(!s.drafted.some(p => p.player_id === player), 'Player already drafted', 409);
  s.drafted.push({ league_id: s.id, user_id: target, player_id: player, player_name: player });
  d.picks.push({ user_id: target, player_id: player, pick_number: expected });
  const username = s.members.find(m => m.id === target).username;
  s.chat ||= [];
  s.chat.push({ id: crypto.randomUUID(), kind: 'draft_pick', user_id: target, username,
    player_id: player, message: username + ' picked: ' + player, created_at: now() });
  s.chat = s.chat.slice(-100);
  d.current_pick++;
  d.is_active = d.current_pick < d.turn_order.length * 15;
  d.turn_start_time = now();
  if (!d.is_active) ensureDefaultLineups(s, stats);
  return d;
}
export function trade(s, actor, payload) {
  member(s, actor);
  check(!s.draft?.is_active, 'Trades are unavailable during a draft');
  const { receiverId, offered, requested } = payload;
  member(s, receiverId);
  check(receiverId !== actor, 'Cannot trade with yourself');
  check(Array.isArray(offered) && Array.isArray(requested) && offered.length > 0 && offered.length === requested.length && new Set(offered).size === offered.length && new Set(requested).size === requested.length, 'Trade equal numbers of different players');
  for (const [id, players] of [[actor, offered], [receiverId, requested]]) {
    check(players.every(p => s.drafted.some(d => d.player_id === p && d.user_id === id)), 'A traded player is no longer owned by this team', 409);
  }
  const t = { id: crypto.randomUUID(), league_id: s.id, sender_id: actor, receiver_id: receiverId,
    players_offered: offered, players_requested: requested, status: 'pending', created_at: now() };
  s.trades.push(t);
  check(s.trades.length <= 500, 'League trade history limit reached');
  return t;
}
export function actOnTrade(s, actor, id, action) {
  member(s, actor);
  const t = s.trades.find(t => t.id === id);
  check(t && t.status === 'pending', 'Trade is no longer pending', 409);
  check(action === 'cancelled' ? actor === t.sender_id : actor === t.receiver_id, 'Not authorized for this trade', 403);
  check(['accepted', 'declined', 'cancelled'].includes(action), 'Invalid trade action');
  if (action === 'accepted') {
    check(!s.draft?.is_active, 'Trades are unavailable during a draft');
    member(s, t.sender_id); member(s, t.receiver_id);
    for (const [owner, players] of [[t.sender_id, t.players_offered], [t.receiver_id, t.players_requested]]) {
      check(players.every(p => s.drafted.some(d => d.player_id === p && d.user_id === owner)), 'Player ownership changed since proposal', 409);
    }
    for (const d of s.drafted) {
      if (t.players_offered.includes(d.player_id)) d.user_id = t.receiver_id;
      else if (t.players_requested.includes(d.player_id)) d.user_id = t.sender_id;
    }
    // Remove outgoing players from both saved lineups. Users choose replacements.
    for (const id of [t.sender_id, t.receiver_id]) {
      if (s.teams[id]) s.teams[id].starting_11 = s.teams[id].starting_11.filter(p => s.drafted.some(d => d.player_id === p && d.user_id === id));
    }
  }
  t.status = action;
  return t;
}
export function fixtures(s, actor, rounds) {
  commissioner(s, actor);
  check(Number.isInteger(rounds) && rounds >= 1 && rounds <= 14, 'Rounds must be 1–14');
  check(s.members.length >= 2, 'At least two members are required');
  check(!s.matches.some(m => m.status === 'completed'), 'Completed fixtures cannot be replaced');
  const rotation = s.members.map(m => m.id);
  if (rotation.length % 2) rotation.push(null);
  s.matches = [];
  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < rotation.length / 2; i++) {
      const a = rotation[i], b = rotation[rotation.length - 1 - i];
      if (a && b) s.matches.push({ id: crypto.randomUUID(), league_id: s.id, round_number: round, team_a_id: a, team_b_id: b,
        status: 'pending', team_a_score: 0, team_b_score: 0, score_due_at: null, finalized_at: null });
    }
    rotation.splice(1, 0, rotation.pop());
  }
  return s.matches;
}
const number = value => Number.parseFloat(value) || 0;
export function playerPoints(player = {}, round) {
  const entries = [...(player.batting || []), ...(player.bowling || []), ...(player.fielding || [])];
  const urls = [...new Set(entries.map(e => e.matchUrl).filter(Boolean))].sort((a, b) => {
    const n = u => Math.min(...entries.filter(e => e.matchUrl === u).map(e => Number(e.matchNumber) || Infinity));
    return n(a) - n(b) || a.localeCompare(b);
  });
  const url = urls[round - 1];
  const entry = type => url ? player[type]?.find(e => e.matchUrl === url) || {} : {};
  const b = entry('batting'), w = entry('bowling'), f = entry('fielding');
  const breakdown = {
    batting: { runs: number(b.runs), fours: number(b.fours) * 2, sixes: number(b.sixes) * 3 },
    bowling: { economy: number(w.overs) > 0 ? 10 - number(w.economy) : 0, wickets: number(w.wickets) * 20 },
    fielding: { catches: number(f.catches) * 8, stumpings: number(f.stumpings) * 5, runouts: number(f.runouts) * 4 }
  };
  return { stats: { batting: { runs: number(b.runs), balls: number(b.balls), sr: number(b.sr), fours: number(b.fours), sixes: number(b.sixes) }, bowling: { overs: number(w.overs), runs: number(w.runs), economy: number(w.economy), wickets: number(w.wickets), maidens: number(w.maidens), dots: number(w.dots) }, fielding: { catches: number(f.catches), stumpings: number(f.stumpings), runouts: number(f.runouts) } }, points: Math.round(Object.values(breakdown).flatMap(Object.values).reduce((a, b) => a + b, 0) * 10) / 10, breakdown };
}
export function finalizeScores(s, actor, stats, ignored) {
  commissioner(s, actor);
  check(Number.isInteger(ignored) && ignored >= 0 && ignored <= 20, 'Ignored rounds must be 0–20');
  check(!s.draft?.is_active, 'Finish drafting before scoring');
  if (s.matches.some(m => m.status === 'completed')) check(ignored === s.ignored_rounds, 'Cannot change ignored rounds after scoring has begun');
  s.ignored_rounds = ignored;
  let count = 0;
  for (const m of s.matches) {
    if (m.status === 'completed' || !m.score_due_at || Date.parse(m.score_due_at) > Date.now()) continue;
    check(Object.keys(stats.players || {}).length > 0, 'Tournament statistics are not loaded');
    m.breakdowns = {};
    for (const id of [m.team_a_id, m.team_b_id]) {
      const lineup = s.teams[id]?.starting_11 || [];
      validateLineup(s, id, lineup, stats);
      const players = lineup.map(name => ({ player_name: name, ...playerPoints(stats.players[name], m.round_number + ignored) }));
      m.breakdowns[id] = { match_id: m.id, league_id: s.id, round_number: m.round_number, status: 'completed', user_id: id,
        starting_11: [...lineup], players, team_total: Math.round(players.reduce((n, p) => n + p.points, 0) * 10) / 10 };
    }
    m.team_a_score = m.breakdowns[m.team_a_id].team_total;
    m.team_b_score = m.breakdowns[m.team_b_id].team_total;
    m.winner_id = m.team_a_score === m.team_b_score ? null : m.team_a_score > m.team_b_score ? m.team_a_id : m.team_b_id;
    m.status = 'completed'; m.finalized_at = now(); count++;
  }
  return count;
}
export function standings(s) {
  return s.members.map(user => {
    const row = { user_id: user.id, username: user.username, played: 0, won: 0, lost: 0, drawn: 0, points: 0, net_points: 0 };
    for (const m of s.matches.filter(m => m.status === 'completed' && [m.team_a_id, m.team_b_id].includes(user.id))) {
      row.played++;
      if (!m.winner_id) row.drawn++; else if (m.winner_id === user.id) row.won++; else row.lost++;
      row.net_points += (m.team_a_score - m.team_b_score) * (m.team_a_id === user.id ? 1 : -1);
    }
    row.points = row.won * 2 + row.drawn;
    return row;
  }).sort((a, b) => b.points - a.points || b.net_points - a.net_points);
}
