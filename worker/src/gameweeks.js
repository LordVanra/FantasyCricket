import { check, ensureDefaultLineups, commissioner, validateLineup, fixtures, playerPoints, now } from './domain.js';

// The ordinal belongs to the IPL team, never to the player's appearances.
export function teamRoundPlan(stats, ordinal) {
  const teams = stats.rosterTeams?.length ? stats.rosterTeams : Object.keys(stats.teams || {});
  check(teams.length >= 2, 'Competition squads are not loaded');
  const schedule = (stats.schedule || []).filter(m => m.leagueStage !== false);
  return teams.map(team => {
    const games = schedule.filter(m => m.teams?.includes(team)).sort((a,b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.url.localeCompare(b.url));
    const game = games[ordinal - 1];
    check(game && Number.isFinite(Date.parse(game.startTime)), 'The full schedule for this IPL team round is not available yet');
    return { team, url: game.url, startTime: game.startTime };
  });
}
export function createGameweeks(s, actor, stats, count, firstRound, clock = Date.now(), historical = false) {
  commissioner(s, actor);
  check(!s.draft?.is_active && s.drafted.length > 0, 'Complete the draft first');
  check(!s.gameweeks?.some(w => Date.parse(w.lock_at) <= clock), 'A started season cannot be replaced');
  check(!s.matches.some(m => m.status === 'completed'), 'Completed results cannot be replaced');
  check(Number.isInteger(count) && count >= 1 && count <= 14 && Number.isInteger(firstRound) && firstRound >= 1 && firstRound + count - 1 <= 14, 'Choose IPL team rounds between 1 and 14');
  ensureDefaultLineups(s, stats);
  for (const m of s.members) validateLineup(s, m.id, s.teams[m.id]?.starting_11 || [], stats);
  const weeks = Array.from({length:count}, (_, i) => {
    const teamMatches = teamRoundPlan(stats, firstRound + i);
    const lockAt = new Date(Math.min(...teamMatches.map(m => Date.parse(m.startTime)))).toISOString();
    check(historical || Date.parse(lockAt) > clock, 'This IPL round has already started. Choose a future round');
    return { number: i+1, ipl_round: firstRound+i, lock_at: lockAt, status:'upcoming', team_matches:teamMatches,
      lineups:Object.fromEntries(s.members.map(m => [m.id, [...s.teams[m.id].starting_11]])) };
  });
  fixtures(s, actor, count);
  s.gameweeks = weeks; s.scoring_version = 2; s.historical = historical;
  if (historical) advanceGameweeks(s, stats, clock);
  return weeks;
}
export function saveGameweekLineup(s, actor, number, lineup, stats, clock=Date.now()) {
  const w=s.gameweeks?.find(w=>w.number===number);
  check(w, 'Gameweek not found',404);
  check(clock < Date.parse(w.lock_at), 'This gameweek lineup is locked',409);
  validateLineup(s, actor, lineup, stats);
  w.lineups[actor]=[...lineup];
  return w.lineups[actor];
}
function scoreForMatch(player, url) {
  const single = Object.fromEntries(['batting','bowling','fielding'].map(type=>[type,(player?.[type] || []).filter(e=>e.matchUrl===url)]));
  return playerPoints(single,1);
}
export function advanceGameweeks(s, stats, clock=Date.now()) {
  if (!s.gameweeks) return;
  const schedule = new Map((stats.schedule || []).map(m=>[m.url,m]));
  const imported = new Set((stats.matches || []).map(m=>m.url));
  for(const w of s.gameweeks) {
    if(w.status==='completed') continue;
    // Re-evaluate team ordinals when IPL fixtures are rescheduled; keep the XI locked.
    w.team_matches = teamRoundPlan(stats, w.ipl_round);
    // Never move a lock later: postponements must not reopen a previously locked XI.
    const starts=w.team_matches.map(m=>Date.parse(schedule.get(m.url)?.startTime || m.startTime));
    const earlier=Math.min(Date.parse(w.lock_at),...starts);
    w.lock_at=new Date(earlier).toISOString();
    if(clock < earlier) continue;
    if(!w.locked_lineups) {
      w.locked_lineups={}; w.player_teams={};
      for(const m of s.members) {
        const lineup=w.lineups[m.id] || [];
        try { validateLineup(s,m.id,lineup,stats); w.locked_lineups[m.id]=[...lineup]; }
        catch { w.locked_lineups[m.id]=[]; }
        for(const name of w.locked_lineups[m.id]) w.player_teams[name]=stats.players[name]?.team;
      }
    }
    const completed=m=>schedule.get(m.url)?.completed===true && imported.has(m.url);
    w.completed_teams=w.team_matches.filter(completed).length;
    const finished=w.completed_teams===w.team_matches.length;
    w.status=finished?'completed':'live';
    for(const match of s.matches.filter(m=>m.round_number===w.number)) {
      match.breakdowns={};
      for(const id of [match.team_a_id,match.team_b_id]) {
        const lineup=w.locked_lineups[id] || [];
        const players=lineup.map(name=> {
          const team=w.player_teams[name];
          const fixture=w.team_matches.find(m=>m.team===team);
          const available=fixture && completed(fixture);
          const player=stats.players[name];
          const result=scoreForMatch(available?player:null,fixture?.url);
          const appeared=available && ['batting','bowling','fielding'].some(type=>player?.[type]?.some(e=>e.matchUrl===fixture.url));
          return { player_name:name, team, match_url:fixture?.url, appearance_status:available?(appeared?'played':'did_not_play'):'awaiting_result', ...result };
        });
        match.breakdowns[id]={match_id:match.id,user_id:id,round_number:w.number,starting_11:[...lineup],players,team_total:Math.round(players.reduce((n,p)=>n+p.points,0)*10)/10,status:w.status,missing_lineup:lineup.length!==11};
      }
      match.team_a_score=match.breakdowns[match.team_a_id].team_total;
      match.team_b_score=match.breakdowns[match.team_b_id].team_total;
      match.status=w.status;
      match.lock_at=w.lock_at;
      if(finished) {
        match.winner_id=match.team_a_score===match.team_b_score?null:match.team_a_score>match.team_b_score?match.team_a_id:match.team_b_id;
        match.finalized_at=now();
      }
    }
  }
}
export function removeFromFutureLineups(s, names, clock=Date.now()) {
  for(const w of s.gameweeks || []) if(Date.parse(w.lock_at)>clock) for(const id of Object.keys(w.lineups)) w.lineups[id]=w.lineups[id].filter(n=>!names.includes(n));
}
