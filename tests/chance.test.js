import test from 'node:test';
import assert from 'node:assert/strict';
import {settleRoulette,rouletteSeries,startChanceGame,actChanceGame,publicChanceGame,WHEEL,SLOT_MATH} from '../lib/chance-games.js';
test('wheel contains each European outcome exactly once',()=>assert.deepEqual([...WHEEL].sort((a,b)=>a-b),Array.from({length:37},(_,i)=>i)));
test('every straight outcome pays gross 36x and loses elsewhere',()=>{for(let n=0;n<=36;n++)for(let outcome=0;outcome<=36;outcome++)assert.equal(settleRoulette([{numbers:[n],amount:10}],outcome),n===outcome?360:0);});
test('legal inside and outside wagers pay correct gross totals for all outcomes',()=>{let groups=[[1,2],[0,1],[0,2,3],[1,2,3],[1,2,4,5],[0,1,2,3],[1,2,3,4,5,6],Array.from({length:12},(_,i)=>i+1),Array.from({length:12},(_,i)=>1+3*i),Array.from({length:18},(_,i)=>i+1),Array.from({length:18},(_,i)=>2*i+1)];for(let numbers of groups)for(let outcome=0;outcome<=36;outcome++)assert.equal(settleRoulette([{numbers,amount:10}],outcome),numbers.includes(outcome)?360/numbers.length:0);});
test('invalid roulette layouts and stakes rejected',()=>{for(let numbers of [[1,3],[3,4],[1,2,4],[0,4],[1,1],[],[37],[1,2,3,5]])assert.throws(()=>settleRoulette([{numbers,amount:10}],1));for(let amount of [0,11,NaN,-10])assert.throws(()=>settleRoulette([{numbers:[1],amount}],1));});
test('named wheel series validate and neighbors wrap',()=>{for(let name of ['voisins','tiers','orphelins','zero','neighbors'])for(let n=0;n<37;n++)assert.doesNotThrow(()=>settleRoulette(rouletteSeries(name,10,n),n));assert.equal(rouletteSeries('neighbors',10,0).length,5);});
test('mines redacts hidden cells and cashout settles once',()=>{let {state,cost}=startChanceGame('mines',100,{mines:3});assert.equal(cost,100);assert.equal(publicChanceGame(state).mineCells,undefined);let safe=Array.from({length:25},(_,i)=>i).find(i=>!state.mineCells.includes(i));actChanceGame(state,'reveal',{cell:safe});let paid=actChanceGame(state,'cashout');assert.ok(paid.payout>100);assert.throws(()=>actChanceGame(state,'cashout'));});
test('crash auto collect wins before crash; late manual loses',()=>{let {state}=startChanceGame('crash',100,{autoCashout:2});state.crashPoint=3;state.startedAt=Date.now()-20000;assert.equal(actChanceGame(state,'cashout').payout,200);let late=startChanceGame('crash',100).state;late.crashPoint=1.1;late.startedAt=Date.now()-20000;assert.equal(actChanceGame(late,'cashout').payout,0);});
test('slots expose 20 lines and preserve stake for free spins',()=>{assert.equal(SLOT_MATH.lines.length,20);let {state}=startChanceGame('slots',100);state.done=false;state.freeSpins=1;state.bonusRounds=0;let spin=actChanceGame(state,'spin');assert.equal(spin.cost,0);assert.equal(spin.state.originatingStake,100);assert.equal(spin.state.grid.length,5);});
test('mines automatically settles final safe cell',()=>{let state=startChanceGame('mines',100,{mines:24}).state;let safe=Array.from({length:25},(_,i)=>i).find(i=>!state.mineCells.includes(i));let r=actChanceGame(state,'reveal',{cell:safe});assert.equal(r.done,true);assert.equal(r.payout,2425);});
test('crash ties lose; unknown actions cannot trigger settlement',()=>{let state=startChanceGame('crash',100,{autoCashout:2}).state;state.crashPoint=2;state.startedAt=Date.now()-20000;assert.throws(()=>actChanceGame(state,'unknown'));assert.equal(state.done,false);assert.equal(actChanceGame(state,'tick').payout,0);});
test('slot bonus only pays once and retains originating stake',()=>{let state=startChanceGame('slots',100).state;Object.assign(state,{done:false,bonusRounds:1,freeSpins:1});assert.throws(()=>actChanceGame(state,'spin'));assert.throws(()=>actChanceGame(state,'bonus',{pick:3}));let r=actChanceGame(state,'bonus',{pick:0});assert.ok([200,300,500].includes(r.payout));assert.equal(r.cost,0);assert.equal(state.freeSpins,1);assert.equal(state.phase,'free-spins');assert.throws(()=>actChanceGame(state,'bonus',{pick:0}));});
test('slot paylines score actual multiplier and leading wild run',async()=>{let {evaluateSlotGrid}=await import('../lib/chance-games.js');let grid=Array.from({length:5},()=>[0,0,0]);assert.equal(evaluateSlotGrid(grid,100,3).payout,evaluateSlotGrid(grid,100,1).payout*3);let wild=[[6,7,7],[6,7,7],[6,7,7],[0,7,7],[7,7,7]];let spin=evaluateSlotGrid(wild,100);assert.equal(spin.wins.find(w=>w.line===0).symbol,6);assert.equal(spin.wins.find(w=>w.line===0).payout,100);});
test('exhaustive table wagers independently cover every legal layout and all 37 outcomes',()=>{
 const layouts=[];
 for(let n=0;n<=36;n++)layouts.push([n]);
 for(let n=1;n<=36;n++){if(n<=33)layouts.push([n,n+3]);if(n%3!==0)layouts.push([n,n+1]);}
 layouts.push([0,1],[0,2],[0,3],[0,1,2],[0,2,3],[0,1,2,3]);
 for(let n=1;n<=34;n+=3)layouts.push([n,n+1,n+2]);
 for(let n=1;n<=32;n++)if(n%3!==0)layouts.push([n,n+1,n+3,n+4]);
 for(let n=1;n<=31;n+=3)layouts.push(Array.from({length:6},(_,i)=>n+i));
 for(let d=0;d<3;d++)layouts.push(Array.from({length:12},(_,i)=>1+d*12+i));
 for(let c=1;c<=3;c++)layouts.push(Array.from({length:12},(_,i)=>c+i*3));
 const red=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
 const all=Array.from({length:36},(_,i)=>i+1);
 layouts.push(red,all.filter(n=>!red.includes(n)),all.filter(n=>n%2===0),all.filter(n=>n%2===1),all.slice(0,18),all.slice(18));
 assert.equal(layouts.length,157);
 const gross={1:360,2:180,3:120,4:90,6:60,12:30,18:20};
 for(const numbers of layouts){let aggregate=0;for(let outcome=0;outcome<=36;outcome++){const paid=settleRoulette([{numbers,amount:10}],outcome);assert.equal(paid,numbers.includes(outcome)?gross[numbers.length]:0,`${numbers} at ${outcome}`);aggregate+=paid;}assert.equal(aggregate,360);}
});
test('all wheel-series component wagers, chip totals, and payouts independently match',()=>{
 const definitions={
 voisins:[[[0,2,3],2],[[4,7],1],[[12,15],1],[[18,21],1],[[19,22],1],[[25,26,28,29],2],[[32,35],1]],
 tiers:[[[5,8],1],[[10,11],1],[[13,16],1],[[23,24],1],[[27,30],1],[[33,36],1]],
 orphelins:[[[1],1],[[6,9],1],[[14,17],1],[[17,20],1],[[31,34],1]],
 zero:[[[0,3],1],[[12,15],1],[[26],1],[[32,35],1]]};
 const totals={voisins:9,tiers:6,orphelins:5,zero:4};
 const gross={1:36,2:18,3:12,4:9};
 for(const [name,definition] of Object.entries(definitions)){
  const actual=rouletteSeries(name,10);assert.equal(actual.length,definition.length);assert.equal(actual.reduce((s,b)=>s+b.amount,0),totals[name]*10);
  assert.deepEqual(actual,definition.map(([numbers,chips])=>({numbers,amount:chips*10})));
  for(let outcome=0;outcome<=36;outcome++){const expected=definition.reduce((sum,[numbers,chips])=>sum+(numbers.includes(outcome)?chips*10*gross[numbers.length]:0),0);assert.equal(settleRoulette(actual,outcome),expected,`${name} at ${outcome}`);}
 }
 const wheel=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
 for(let center=0;center<=36;center++){
  const i=wheel.indexOf(center),expected=[wheel[(i+35)%37],wheel[(i+36)%37],center,wheel[(i+1)%37],wheel[(i+2)%37]],actual=rouletteSeries('neighbors',10,center);
  assert.equal(actual.length,5);assert.equal(actual.reduce((s,b)=>s+b.amount,0),50);assert.deepEqual(actual.map(b=>b.numbers[0]),expected);
  for(let outcome=0;outcome<=36;outcome++)assert.equal(settleRoulette(actual,outcome),expected.includes(outcome)?360:0);
 }
});
