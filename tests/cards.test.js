import test from 'node:test';
import assert from 'node:assert/strict';
import {blackjackValue,pokerRank,threeCardRank,createDeck} from '../lib/cards.js';
import {startCardGame,actCardGame,publicCardGame,baccaratBankerDraws} from '../lib/card-games.js';
const c=(rank,suit='♠')=>({rank,suit});
test('shuffled deck has all unique cards',()=>{const d=createDeck();assert.equal(d.length,52);assert.equal(new Set(d.map(x=>x.rank+x.suit)).size,52);});
test('ace totals and wheel straight',()=>{assert.equal(blackjackValue([c(14),c(14),c(9)]).total,21);assert.deepEqual(pokerRank([c(14),c(2),c(3),c(4),c(5)]),[8,5]);assert.deepEqual(threeCardRank([c(14),c(2),c(3)]),[5,3]);});
function bj(cards,dealer,deck=[]){return {type:'blackjack',bet:20,phase:'playing',done:false,deck,hands:[{cards,bet:20,stood:false}],dealer,active:0};}
test('blackjack double charges additional stake and pays both stakes',()=>{const r=actCardGame(bj([c(5),c(6)],[c(10),c(8)],[c(10)]),'double');assert.equal(r.cost,20);assert.equal(r.payout,80);assert.equal(r.done,true);});
test('blackjack surrender returns half',()=>{const r=actCardGame(bj([c(10),c(6)],[c(10),c(8)]),'surrender');assert.equal(r.payout,10);});
test('blackjack split aces closes both hands',()=>{const r=actCardGame(bj([c(14),c(14)],[c(10),c(8)],[c(9),c(10)]),'split');assert.equal(r.cost,20);assert.equal(r.done,true);assert.equal(r.payout,80);});
test('ace and king cannot split',()=>assert.throws(()=>actCardGame(bj([c(14),c(13)],[c(10),c(8)]),'split')));
test('dealer natural insurance returns three insurance stakes',()=>{const s=bj([c(10),c(9)],[c(14),c(13)]);s.phase='insurance';const r=actCardGame(s,'insurance');assert.equal(r.cost,10);assert.equal(r.payout,30);});
test('public view hides dealer and deck without mutating engine',()=>{const s=bj([c(10),c(9)],[c(10),c(8)],[c(2)]);const p=publicCardGame(s);assert.equal(p.deck,undefined);assert.deepEqual(p.dealer[1],{hidden:true});assert.equal(s.dealer[1].rank,8);});
test('russian exchange validates indices and can be used once',()=>{let r=startCardGame('russian',20);assert.throws(()=>actCardGame(r.state,'exchange',{indices:[0,0]}));r=actCardGame(r.state,'exchange',{indices:[0,2]});assert.equal(r.cost,20);assert.throws(()=>actCardGame(r.state,'sixth'));r=actCardGame(r.state,'play');assert.equal(r.cost,40);assert.equal(r.done,true);});
test('holdem check progresses board and requires decision at river',()=>{let r=startCardGame('holdem',20);assert.equal(r.state.phase,'preflop');assert.equal(r.state.community.length,0);r=actCardGame(r.state,'check');assert.equal(r.state.phase,'flop');assert.equal(r.state.community.length,3);r=actCardGame(r.state,'check');assert.equal(r.state.phase,'turn');r=actCardGame(r.state,'check');assert.equal(r.state.phase,'river');assert.throws(()=>actCardGame(r.state,'check'));r=actCardGame(r.state,'bet');assert.equal(r.done,true);assert.equal(r.state.community.length,5);});
test('all card games can finish and serialize',()=>{for(const type of ['blackjack','russian','threecard','holdem','baccarat'])for(let i=0;i<20;i++){let r=startCardGame(type,20);if(r.state.phase==='insurance')r=actCardGame(r.state,'declineInsurance');while(!r.done)r=actCardGame(r.state,type==='blackjack'?'stand':type==='holdem'?'bet':'play');assert.ok(Number.isInteger(r.payout));assert.doesNotThrow(()=>JSON.stringify(r.state));assert.throws(()=>actCardGame(r.state,'play'));}});

test('baccarat banker third card table exhaustively',()=>{const allowed=[Array.from({length:10},(_,i)=>i),Array.from({length:10},(_,i)=>i),Array.from({length:10},(_,i)=>i),[0,1,2,3,4,5,6,7,9],[2,3,4,5,6,7],[4,5,6,7],[6,7],[],[],[]];for(let b=0;b<10;b++){assert.equal(baccaratBankerDraws(b,null),b<=5);for(let t=0;t<10;t++)assert.equal(baccaratBankerDraws(b,t),allowed[b].includes(t),`banker ${b} third ${t}`);}});
test('Pair Plus independent winning bet survives fold',()=>{let r=startCardGame('threecard',20,{pairPlus:10});assert.equal(r.cost,30);r.state.player=[c(2),c(3),c(4)];r=actCardGame(r.state,'fold');assert.equal(r.payout,410);assert.equal(r.done,true);});
test('Pair Plus loses independently on high card fold',()=>{let r=startCardGame('threecard',20,{pairPlus:10});r.state.player=[c(2),c(6,'♥'),c(11)];r=actCardGame(r.state,'fold');assert.equal(r.payout,0);});
test('blackjack dealer stands soft seventeen',()=>{const r=actCardGame(bj([c(10),c(8)],[c(14),c(6)],[c(10)]),'stand');assert.equal(r.payout,40);assert.equal(r.state.dealer.length,2);});
test('blackjack dealer draws below seventeen and busts',()=>{const r=actCardGame(bj([c(10),c(8)],[c(10),c(6)],[c(10)]),'stand');assert.equal(r.payout,40);assert.equal(r.state.dealer.length,3);});
test('blackjack split keeps each hand separate and disallows resplit/surrender',()=>{let r=actCardGame(bj([c(8),c(8)],[c(10),c(8)],[c(3),c(2)]),'split');assert.equal(r.cost,20);assert.equal(r.state.hands.length,2);assert.throws(()=>actCardGame(r.state,'surrender'));assert.throws(()=>actCardGame(r.state,'split'));r=actCardGame(r.state,'stand');assert.equal(r.state.active,1);assert.equal(r.done,false);r=actCardGame(r.state,'stand');assert.equal(r.done,true);assert.equal(r.payout,0);});
test('blackjack naturals settle after insurance decision with 3:2 payout',()=>{let s=bj([c(14),c(13)],[c(14),c(9)]);s.phase='insurance';let r=actCardGame(s,'declineInsurance');assert.equal(r.done,true);assert.equal(r.payout,50);s=bj([c(14),c(13)],[c(14),c(10)]);s.phase='insurance';r=actCardGame(s,'declineInsurance');assert.equal(r.payout,20);});
test('insurance losing stake and late double restrictions',()=>{const s=bj([c(5),c(6)],[c(14),c(7)],[c(2)]);s.phase='insurance';let r=actCardGame(s,'insurance');assert.equal(r.cost,10);assert.equal(r.done,false);assert.equal(r.state.insuranceReturn,0);r=actCardGame(r.state,'hit');assert.throws(()=>actCardGame(r.state,'double'));assert.throws(()=>actCardGame(r.state,'surrender'));});

const hand=(ranks,suits=['♠','♥','♦','♣','♠','♥','♦'])=>ranks.map((rank,i)=>c(rank,suits[i]));
const pokerState=(type,player,dealer,extra={})=>({type,bet:20,phase:'decision',done:false,deck:[],player,dealer,...extra});
test('five-card poker recognizes every category and orders kickers',()=>{const cases=[
 [hand([14,11,9,6,3]),[0,14,11,9,6,3]],
 [hand([10,10,14,8,4]),[1,10,14,8,4]],
 [hand([13,13,4,4,9]),[2,13,4,9]],
 [hand([7,7,7,14,2]),[3,7,14,2]],
 [hand([9,8,7,6,5]),[4,9]],
 [hand([14,11,8,5,2],Array(5).fill('♥')),[5,14,11,8,5,2]],
 [hand([8,8,8,4,4]),[6,8,4]],
 [hand([12,12,12,12,14]),[7,12,14]],
 [hand([13,12,11,10,9],Array(5).fill('♦')),[8,13]],
 ];for(const [cards,expected] of cases)assert.deepEqual(pokerRank(cards),expected);
});
test('best five of seven chooses higher full house and uses board straight flush',()=>{assert.deepEqual(pokerRank(hand([14,14,14,13,13,13,2])),[6,14,13]);assert.deepEqual(pokerRank([c(2,'♣'),c(3,'♣'),...hand([10,11,12,13,14],Array(5).fill('♥'))]),[8,14]);});
test('russian ace-king qualifies; ace-queen does not',()=>{const player=hand([12,12,9,5,2]);let r=actCardGame(pokerState('russian',player,hand([14,13,10,8,4])),'play');assert.equal(r.cost,40);assert.equal(r.state.dealerQualified,true);assert.equal(r.payout,120);r=actCardGame(pokerState('russian',player,hand([14,12,10,8,4])),'play');assert.equal(r.state.dealerQualified,false);assert.equal(r.payout,80);});
test('russian tie pushes ante and play; qualified loss pays nothing',()=>{let r=actCardGame(pokerState('russian',hand([10,10,14,8,3]),hand([10,10,14,8,3],['♥','♦','♣','♠','♥'])),'play');assert.equal(r.payout,60);assert.equal(r.state.outcome,'push');r=actCardGame(pokerState('russian',hand([10,10,14,8,3]),hand([11,11,14,8,3])),'play');assert.equal(r.payout,0);assert.equal(r.state.outcome,'lose');});
test('russian qualifying wins pay documented table for every category',()=>{const playerHands=[hand([14,13,12,11,8]),hand([10,10,14,8,3]),hand([10,10,8,8,3]),hand([10,10,10,8,3]),hand([10,9,8,7,6]),hand([14,12,9,7,3],Array(5).fill('♠')),hand([10,10,10,8,8]),hand([10,10,10,10,8]),hand([10,9,8,7,6],Array(5).fill('♠'))];const dealer=hand([14,13,10,8,4]);const multipliers=[1,1,2,3,4,5,7,20,50];playerHands.forEach((cards,i)=>{const r=actCardGame(pokerState('russian',cards,dealer),'play');assert.equal(r.state.playerRank[0],i);assert.equal(r.payout,40+40*(1+multipliers[i]),`category ${i}`);});});
test('russian sixth card improves best-five hand and charges one ante',()=>{const s=pokerState('russian',hand([10,10,8,5,2]),hand([14,13,11,7,3]),{deck:[c(10,'♦')]});let r=actCardGame(s,'sixth');assert.equal(r.cost,20);assert.equal(r.state.player.length,6);assert.equal(s.player.length,5);assert.throws(()=>actCardGame(r.state,'exchange',{indices:[0]}));r=actCardGame(r.state,'play');assert.equal(r.cost,40);assert.equal(r.state.playerRank[0],3);assert.equal(r.payout,200);});
test('russian insurance pays only dealer nonqualification, independent of main hand',()=>{const player=hand([10,10,8,5,2]);let r=actCardGame(pokerState('russian',player,hand([14,12,11,7,3])),'insurance');assert.equal(r.cost,20);assert.throws(()=>actCardGame(r.state,'insurance'));r=actCardGame(r.state,'play');assert.equal(r.payout,140);r=actCardGame(pokerState('russian',player,hand([14,13,11,7,3])),'insurance');r=actCardGame(r.state,'play');assert.equal(r.payout,120);});
test('three-card dealer queen qualifies; jack does not',()=>{const player=hand([13,9,2]);let r=actCardGame(pokerState('threecard',player,hand([12,8,3])),'play');assert.equal(r.cost,20);assert.equal(r.state.dealerQualified,true);assert.equal(r.payout,80);r=actCardGame(pokerState('threecard',player,hand([11,8,3])),'play');assert.equal(r.state.dealerQualified,false);assert.equal(r.payout,60);});
test('three-card ties return both stakes; dealer pair qualifies regardless of high rank',()=>{let r=actCardGame(pokerState('threecard',hand([12,9,3]),hand([12,9,3],['♥','♣','♠'])),'play');assert.equal(r.payout,40);assert.equal(r.state.outcome,'push');r=actCardGame(pokerState('threecard',hand([14,13,9]),hand([2,2,3])),'play');assert.equal(r.state.dealerQualified,true);assert.equal(r.payout,0);});
test('three-card ante bonus pays despite stronger dealer and is not paid on fold',()=>{const cases=[{player:hand([2,3,4]),dealer:hand([5,6,7]),bonus:20},{player:hand([3,3,3]),dealer:hand([4,4,4]),bonus:80},{player:hand([2,3,4],Array(3).fill('♠')),dealer:hand([5,6,7],Array(3).fill('♥')),bonus:100}];for(const {player,dealer,bonus}of cases){let r=actCardGame(pokerState('threecard',player,dealer),'play');assert.equal(r.payout,bonus);r=actCardGame(pokerState('threecard',player,dealer),'fold');assert.equal(r.payout,0);}});
test('Pair Plus table pays independently of dealer and main-game loss on play or fold',()=>{const cases=[[hand([2,5,9]),0],[hand([2,2,9]),2],[hand([2,5,9],Array(3).fill('♠')),4],[hand([2,3,4]),7],[hand([2,2,2]),31],[hand([2,3,4],Array(3).fill('♠')),41]];for(const [player,multiple]of cases){const dealer=hand([12,13,14],Array(3).fill('♥'));let r=actCardGame(pokerState('threecard',player,dealer,{pairPlus:10}),'fold');assert.equal(r.payout,10*multiple);r=actCardGame(pokerState('threecard',player,dealer,{pairPlus:10}),'play');const category=threeCardRank(player)[0],bonus=category===3?20:category===4?80:category===5?100:0;assert.equal(r.payout,10*multiple+bonus);}});

test('blackjack multiple boxes share dealer, skip naturals, and pay each hand once',()=>{
 const s=bj([c(14),c(13)],[c(14),c(7)],[]);s.bet=60;s.phase='insurance';
 s.hands=[{box:0,cards:[c(14),c(13)],bet:20,stood:false},{box:2,cards:[c(10),c(8)],bet:40,stood:false}];
 let r=actCardGame(s,'declineInsurance');assert.equal(r.done,false);assert.equal(r.state.active,1);assert.equal(r.state.hands[0].natural,true);
 r=actCardGame(r.state,'stand');assert.equal(r.payout,90);assert.deepEqual(r.state.hands.map(h=>h.payout),[50,40]);assert.equal(r.done,true);assert.throws(()=>actCardGame(r.state,'stand'));
});
test('blackjack multi-box insurance covers total and dealer natural settles all boxes',()=>{
 const s=bj([c(14),c(13)],[c(14),c(10)],[]);s.bet=60;s.phase='insurance';s.hands=[{box:0,cards:[c(14),c(13)],bet:20},{box:4,cards:[c(10),c(8)],bet:40}];
 const r=actCardGame(s,'insurance');assert.equal(r.cost,30);assert.equal(r.payout,110);assert.deepEqual(r.state.hands.map(h=>h.outcome),['push','lose']);
});
test('blackjack permits a single split in each box and doubles only the active hand',()=>{
 const s=bj([c(8),c(8)],[c(10),c(8)],[c(10),c(3),c(2)]);s.bet=60;s.hands[0].box=0;s.hands.push({box:3,cards:[c(5),c(6)],bet:40,stood:false});
 let r=actCardGame(s,'split');assert.equal(r.cost,20);assert.deepEqual(r.state.hands.map(h=>h.box),[0,0,3]);assert.throws(()=>actCardGame(r.state,'split'));assert.throws(()=>actCardGame(r.state,'surrender'));
 r=actCardGame(r.state,'stand');r=actCardGame(r.state,'stand');assert.equal(r.state.active,2);r=actCardGame(r.state,'double');assert.equal(r.cost,40);assert.equal(r.payout,160);assert.equal(r.state.hands[2].bet,80);
});
test('blackjack surrender remains available on an unsplit independent box',()=>{
 const s=bj([c(10),c(6)],[c(10),c(8)]);s.bet=40;s.hands[0].box=0;s.hands.push({box:1,cards:[c(10),c(7)],bet:20,stood:false});
 let r=actCardGame(s,'surrender');assert.equal(r.done,false);assert.equal(r.state.active,1);r=actCardGame(r.state,'surrender');assert.equal(r.payout,20);
});
test('multi-box input rejects duplicates, invalid seats, totals and fractional commissions',()=>{
 for(const boxes of [[{box:5,bet:20}],[{box:0,bet:10},{box:0,bet:10}],[{box:1,bet:10}],[{box:1,bet:1.5}]])assert.throws(()=>startCardGame('blackjack',20,{boxes}));
 assert.throws(()=>startCardGame('baccarat',30,{boxes:[{box:0,selection:'banker',bet:30}]}));
 assert.throws(()=>startCardGame('baccarat',20,{boxes:[{box:0,selection:'bogus',bet:20}]}));
 for(const type of ['blackjack','baccarat']){const r=startCardGame(type,60,{boxes:[{box:0,bet:20},{box:4,bet:40}]});assert.equal(r.cost,60);assert.equal(r.state.boxes.length,2);assert.equal(publicCardGame(r.state).deck,undefined);}
});
test('baccarat all boxes use the same outcome and sum per-side payouts exactly',()=>{
 const boxes=[{box:0,selection:'player',bet:100},{box:1,selection:'banker',bet:100},{box:4,selection:'tie',bet:100}];
 for(let i=0;i<100;i++){const r=startCardGame('baccarat',300,{boxes});const winner=r.state.outcome;const expected=winner==='tie'?[100,100,900]:winner==='player'?[200,0,0]:[0,195,0];assert.deepEqual(r.state.boxes.map(b=>b.payout),expected);assert.equal(r.payout,expected.reduce((a,b)=>a+b,0));assert.equal(r.cost,300);}
});

test('blackjack can split two separate boxes against the same dealer',()=>{
 const s=bj([c(8),c(8)],[c(10),c(8)],[c(4),c(3),c(2),c(2)]);s.bet=40;s.hands[0].box=0;s.hands.push({box:1,cards:[c(7),c(7)],bet:20,stood:false});
 let r=actCardGame(s,'split');r=actCardGame(r.state,'stand');r=actCardGame(r.state,'stand');assert.equal(r.state.active,2);r=actCardGame(r.state,'split');assert.equal(r.cost,20);assert.deepEqual(r.state.hands.map(h=>h.box),[0,0,1,1]);r=actCardGame(r.state,'stand');r=actCardGame(r.state,'stand');assert.equal(r.done,true);assert.equal(r.payout,0);
});
