import test from 'node:test';
import assert from 'node:assert/strict';
import {playerPoints,legalBalls} from '../src/domain.js';
test('economy scales by legal balls, without a minimum spell',()=>{
 assert.equal(legalBalls('3.2'),20);
 for (const [overs,economy,expected] of [['1',4,10.5],['4',4,42],['1',24,-19.5],['4',24,-78],['0.1',11,0],['0',4,0],['3.2',5,30]]) {
  const result=playerPoints({bowling:[{matchUrl:'m',overs,economy}]},1,1);
  assert.equal(result.breakdown.bowling.economy,expected);
 }
});
test('all XI slots multiply only batting; wickets and fielding remain independent',()=>{
 const player={batting:[{matchUrl:'m',runs:40,fours:4,sixes:2}],bowling:[{matchUrl:'m',overs:4,economy:7,wickets:2}],fielding:[{matchUrl:'m',catches:1}]};
 for(const [i,multiplier] of [1.25,1.25,1.1,1.1,1,1,1,1,.9,.9,.9].entries()) {
  const result=playerPoints(player,1,i+1);
  assert.equal(result.points,Math.round((54*multiplier+24+50+8)*10)/10);
  assert.equal(result.breakdown.bowling.wickets,50);
  assert.equal(result.stats.batting.runs,40);
 }
});
