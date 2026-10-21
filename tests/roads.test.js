import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBaccaratRoads} from '../public/baccarat-roads.js';
const rounds=types=>types.map(outcome=>({outcome}));
test('bead road fills six rows then the next column and counts pairs',()=>{
 const input=rounds(['banker','player','tie','banker','banker','player','tie']);input[0].bankerPair=true;input[6].playerPair=true;
 const r=buildBaccaratRoads(input);assert.equal(r.total,7);assert.deepEqual(r.bead.map(c=>[c.column,c.row]),[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[1,0]]);assert.deepEqual(r.counts,{banker:3,player:2,tie:2,playerPair:1,bankerPair:1});
});
test('big road extends streaks, wraps right at row six and starts changes from the next base column',()=>{
 const r=buildBaccaratRoads(rounds([...Array(8).fill('banker'),'player','player','banker']));assert.deepEqual(r.big.map(c=>[c.column,c.row]),[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[1,5],[2,5],[1,0],[1,1],[2,0]]);
 assert.equal(new Set(r.big.map(c=>c.column+','+c.row)).size,r.big.length);
});
test('ties annotate the current big-road mark and preserve pair indicators including leading ties',()=>{
 const input=[{outcome:'tie',bankerPair:true},{outcome:'tie'},{outcome:'player'},{outcome:'tie',playerPair:true},{outcome:'banker'}];const r=buildBaccaratRoads(input);assert.equal(r.big.length,2);assert.equal(r.big[0].ties,3);assert.equal(r.big[0].playerPair,true);assert.equal(r.big[0].bankerPair,true);assert.deepEqual([r.big[1].column,r.big[1].row],[1,0]);
 const only=buildBaccaratRoads(rounds(['tie','tie']));assert.equal(only.big.length,1);assert.equal(only.big[0].type,'tie');assert.equal(only.big[0].ties,2);
});
test('big road avoids occupied cells when a long previous streak blocks descent',()=>{
 const r=buildBaccaratRoads(rounds([...Array(8).fill('banker'),...Array(8).fill('player'),...Array(8).fill('banker')]));assert.equal(r.big.length,24);assert.equal(new Set(r.big.map(c=>c.column+','+c.row)).size,24);assert.ok(r.big.every(c=>c.row>=0&&c.row<6&&c.column>=0));
});
