import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLeague } from '../src/domain.js';
import { createGameweeks, saveGameweekLineup, advanceGameweeks, teamRoundPlan, removeFromFutureLineups } from '../src/gameweeks.js';
const base=Date.parse('2027-04-01T00:00:00Z');
const at=n=>base+n*3600000;
function setup(){
 const s=emptyLeague('l','League','CODE',{id:'a',username:'Alice'});s.members.push({id:'b',username:'Bob'});
 const match=(url,teams,h)=>({url,teams,startTime:new Date(at(h)).toISOString(),completed:false,leagueStage:true});
 const stats={teams:{A:[],B:[],C:[],D:[]},schedule:[match('ab1',['A','B'],10),match('cd1',['C','D'],20),match('ab2',['A','B'],30),match('ab3',['A','B'],35),match('cd2',['C','D'],40)],matches:[],players:{}};
 for(let i=0;i<22;i++){
  const name='P'+i;stats.players[name]={team:i%2?'C':'A',playerType:i%11<4?'batsman':i%11<8?'bowler':'allrounder',batting:[],bowling:[],fielding:[]};
  s.drafted.push({user_id:i<11?'a':'b',player_id:name});
 }
 s.teams={a:{starting_11:Array.from({length:11},(_,i)=>'P'+i)},b:{starting_11:Array.from({length:11},(_,i)=>'P'+(i+11))}};
 return {s,stats};
}
test('second IPL team match is selected despite unequal weekly frequency and missed appearances',()=>{
 const {s,stats}=setup();
 stats.players.P0.batting=[{matchUrl:'ab1',runs:10},{matchUrl:'ab3',runs:100}];
 stats.players.P1.batting=[{matchUrl:'cd2',runs:7}];
 createGameweeks(s,'a',stats,2,1,at(0));
 assert.equal(teamRoundPlan(stats,2).find(m=>m.team==='A').url,'ab2');
 stats.schedule.forEach(m=>m.completed=true);stats.matches=stats.schedule.map(m=>({url:m.url}));
 advanceGameweeks(s,stats,at(50));
 const match=s.matches.find(m=>m.round_number===2);
 const p0=match.breakdowns.a.players.find(p=>p.player_name==='P0');
 assert.equal(p0.points,0);assert.equal(p0.appearance_status,'did_not_play');assert.equal(p0.match_url,'ab2');
 assert.equal(match.breakdowns.a.players.find(p=>p.player_name==='P1').points,7);
 assert.equal(match.status,'completed');
});
test('round waits for all teams and never finalizes merely because its deadline passed',()=>{
 const {s,stats}=setup();createGameweeks(s,'a',stats,2,1,at(0));
 stats.schedule[0].completed=true;stats.matches=[{url:'ab1'}];
 advanceGameweeks(s,stats,at(21));assert.equal(s.gameweeks[0].status,'live');assert.equal(s.gameweeks[0].completed_teams,2);
 stats.schedule[1].completed=true;advanceGameweeks(s,stats,at(22));assert.equal(s.gameweeks[0].status,'live');
 stats.matches.push({url:'cd1'});advanceGameweeks(s,stats,at(23));assert.equal(s.gameweeks[0].status,'completed');
});
test('overlapping gameweeks have separate deadline-locked lineups and immutable results',()=>{
 const {s,stats}=setup();createGameweeks(s,'a',stats,2,1,at(0));
 advanceGameweeks(s,stats,at(11));
 assert.throws(()=>saveGameweekLineup(s,'a',1,s.teams.a.starting_11,stats,at(11)),/locked/);
 assert.doesNotThrow(()=>saveGameweekLineup(s,'a',2,[...s.teams.a.starting_11].reverse(),stats,at(11)));
 assert.notDeepEqual(s.gameweeks[0].locked_lineups.a,s.gameweeks[1].lineups.a);
 advanceGameweeks(s,stats,at(31));
 removeFromFutureLineups(s,['P0'],at(31));assert(s.gameweeks[0].locked_lineups.a.includes('P0'));
 s.teams.a.starting_11=[];
 stats.schedule.forEach(m=>m.completed=true);stats.matches=stats.schedule.map(m=>({url:m.url}));advanceGameweeks(s,stats,at(50));
 const result=JSON.stringify(s.matches);stats.players.P0.batting=[{matchUrl:'ab1',runs:999}];advanceGameweeks(s,stats,at(60));assert.equal(JSON.stringify(s.matches),result);
});
test('season setup rejects backdating, absent schedule and invalid XI',()=>{
 const {s,stats}=setup();assert.throws(()=>createGameweeks(s,'a',stats,1,1,at(11)),/already started/);
 assert.throws(()=>createGameweeks(s,'b',stats,1,1,at(0)),/Commissioner/);
 assert.throws(()=>createGameweeks(s,'a',{...stats,schedule:[]},1,1,at(0)),/schedule/);
 s.teams.a.starting_11=[];assert.throws(()=>createGameweeks(s,'a',stats,1,1,at(0)),/11/);
});
test('a postponed match never reopens a locked lineup',()=>{
 const {s,stats}=setup();createGameweeks(s,'a',stats,1,1,at(0));advanceGameweeks(s,stats,at(11));
 stats.schedule[0].startTime=new Date(at(25)).toISOString();advanceGameweeks(s,stats,at(12));
 assert.equal(s.gameweeks[0].lock_at,new Date(at(10)).toISOString());
 assert.throws(()=>saveGameweekLineup(s,'a',1,s.teams.a.starting_11,stats,at(12)),/locked/);
});

test('match details snapshot raw stats separately from points and retain the assigned fixture',()=>{
 const {s,stats}=setup();createGameweeks(s,'a',stats,1,1,at(0));
 stats.players.P0.batting=[{matchUrl:'ab1',runs:40,balls:25,sr:160,fours:4,sixes:2},{matchUrl:'ab2',runs:999}];
 stats.players.P0.bowling=[{matchUrl:'ab1',overs:4,runs:28,economy:7,wickets:2}];
 stats.players.P0.fielding=[{matchUrl:'ab1',catches:1,stumpings:1,runouts:1}];
 stats.schedule.forEach(m=>m.completed=true);stats.matches=stats.schedule.map(m=>({url:m.url}));
 advanceGameweeks(s,stats,at(50));
 const row=s.matches[0].breakdowns.a.players[0];
 assert.equal(row.stats.batting.balls,25);assert.equal(row.stats.batting.sr,160);
 assert.equal(row.stats.bowling.wickets,2);assert.equal(row.breakdown.bowling.wickets,40);
 assert.equal(row.points,114);assert.equal(row.stats.batting.runs,40);
 stats.players.P0.batting[0].runs=900;advanceGameweeks(s,stats,at(60));
 assert.equal(s.matches[0].breakdowns.a.players[0].stats.batting.runs,40);
});
