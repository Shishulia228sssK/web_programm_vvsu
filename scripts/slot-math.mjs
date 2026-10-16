import {startChanceGame,actChanceGame} from '../lib/chance-games.js';
const rounds=Number(process.argv[2]||10000),bet=100;
if(!Number.isSafeInteger(rounds)||rounds<1||rounds>1000000)throw Error('rounds: 1–1000000');
let totalCost=0,totalPayout=0,anyPayout=0,profitable=0,freeSpins=0,bonuses=0;
for(let i=0;i<rounds;i++){
 let r=startChanceGame('slots',bet),paid=r.payout;totalCost+=r.cost;
 while(!r.done){if(r.state.bonusRounds){bonuses++;r=actChanceGame(r.state,'bonus',{pick:0});}else {freeSpins++;r=actChanceGame(r.state,'spin');}paid+=r.payout;}
 totalPayout+=paid;if(paid>0)anyPayout++;if(paid>bet)profitable++;
}
console.log(JSON.stringify({rounds,stake:bet,totalCost,totalPayout,netPlayerResult:totalPayout-totalCost,anyPayoutCount:anyPayout,anyPayoutFrequency:anyPayout/rounds,profitableCount:profitable,profitableFrequency:profitable/rounds,freeSpins,bonuses,note:'Empirical simulation of this implementation; no certified or theoretical RTP claim. Each round includes all awarded free spins and bonus picks.'},null,2));
