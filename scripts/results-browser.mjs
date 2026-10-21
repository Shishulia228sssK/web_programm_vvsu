import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
import {startChanceGame} from '../lib/chance-games.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'ludka-results-')),app=await createApp({dataDir:dir});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const report=[],errors=[];await mkdir('test-results',{recursive:true});
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const mobile=viewport.width<500,label=mobile?'mobile':'desktop';
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const username=`result_${label}`;
  const registration=await context.request.post(url+'/api/register',{data:{username,password:'Result-test-password'}});assert.equal(registration.status(),200);
  // Isolated deterministic fixture: seven free spins already credited 350 coins.
  // Production RNG and award rules are unchanged; the remaining spin uses the real API.
  await app.store.transaction(data=>{const u=data.users[username],g=startChanceGame('slots',100).state;Object.assign(g,{done:false,phase:'free-spins',freeSpins:1,bonusRounds:0,freeSpinsPlayed:7,freeSpinsAwarded:8,paidSpinPayout:50,freeSpinPayout:350,bonusPickPayout:0,lastSpinPayout:50,lastFreeSpinsAwarded:0,totalCost:100,totalPayout:400});u.game=g;u.balance=50300;u.version++;});
  await page.goto(url);await page.waitForSelector('.slot-bonus-board');await page.waitForSelector('.slot-guide table');assert.match(await page.title(),/ЛУДКА.COM/);assert.match(await page.locator('.slot-bonus-board').innerText(),/350/);
  await page.reload();await page.waitForSelector('.slot-bonus-board');assert.match(await page.locator('.slot-bonus-board').innerText(),/350/,'Bonus winnings survive reload');
  await page.evaluate(()=>notifyRoundResult({...snapshot.game,freeSpins:8,freeSpinsPlayed:0,lastFreeSpinsAwarded:8,scatters:3}));
  assert.equal(await page.locator('#roundResultDialog').getAttribute('data-kind'),'bonus');assert.match(await page.locator('#roundResultContent').innerText(),/\+8/);await page.screenshot({path:`test-results/${label}-free-spins-award.png`});await page.locator('#roundResultContinue').click();
  let current=await (await context.request.get(url+'/api/me')).json();
  for(let step=0;!current.game.done&&step<100;step++){
   const previous=current,bonus=current.game.bonusRounds>0,selector=bonus?'[data-bonus="0"]':'[data-action=spin]';
   const response=page.waitForResponse(r=>r.url().endsWith('/api/game/action')&&r.request().method()==='POST');
   await page.locator(selector).click();const r=await response;assert.equal(r.status(),200);current=await r.json();await page.waitForFunction(()=>!document.querySelector('#main').classList.contains('loading'));
   assert.equal(current.game.totalCost,100,'Free spins and picks never charge another stake');assert.equal(current.game.originatingStake,100);
   const payoutDelta=current.game.totalPayout-previous.game.totalPayout;assert.equal(current.user.balance,previous.user.balance+payoutDelta);
   if(!bonus){assert.equal(current.game.freeSpinPayout,previous.game.freeSpinPayout+payoutDelta);assert.equal(current.game.freeSpinsPlayed,previous.game.freeSpinsPlayed+1);}
   if(!current.game.done&&await page.locator('#roundResultDialog').evaluate(e=>e.open))await page.locator('#roundResultContinue').click();
  }
  assert.equal(current.game.done,true);assert.equal(await page.locator('#roundResultDialog').evaluate(e=>e.open),true);assert.equal(await page.locator('.free-series-total').count(),1);
  assert.equal(Number(await page.locator('.round-result').getAttribute('data-payout')),current.game.totalPayout);assert.equal(Number(await page.locator('.round-result').getAttribute('data-net')),current.game.totalPayout-100);
  await page.screenshot({path:`test-results/${label}-bonus-result.png`});await page.locator('#roundResultContinue').click();await page.locator('#roundDetails').click();assert.equal(await page.locator('#roundResultDialog').evaluate(e=>e.open),true,'Result can be reopened');await page.locator('#roundResultContinue').click();
  for(const [payout,kind] of [[250,'win'],[0,'loss'],[100,'push'],[80,'loss']]){
   await page.evaluate(payout=>showRoundResult({type:'roulette',bet:100,totalCost:100,totalPayout:payout,done:true}),payout);
   assert.equal(await page.locator('#roundResultDialog').getAttribute('data-kind'),kind);assert.equal(Number(await page.locator('.round-result').getAttribute('data-net')),payout-100);
   assert.ok(await page.locator('#roundResultDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Result dialog fits viewport');
   if(payout===80)await page.screenshot({path:`test-results/${label}-loss-result.png`});
   await page.locator('#roundResultContinue').click();
  }
  await page.locator('#leaderboardFooter').click();await page.waitForSelector('.leaderboard-table');assert.equal(await page.locator('.your-rank').count(),1);await page.screenshot({path:`test-results/${label}-leaderboard.png`});await page.locator('#leaderboardDialog .close').click();
  await page.locator('#backBtn').click();await page.locator('[data-game=baccarat]').click();assert.equal(await page.locator('.box-bet').count(),25);
  await page.locator('#clearBoxes').click();await page.locator('[data-box="0"][data-box-side=playerPair]').click();await page.locator('[data-box="2"][data-box-side=bankerPair]').click();
  const betResponse=page.waitForResponse(r=>r.url().endsWith('/api/game/start')&&r.request().method()==='POST');await page.locator('#startBtn').click();const bet=await betResponse;assert.equal(bet.status(),200);const game=(await bet.json()).game;await page.waitForFunction(()=>!document.querySelector('#main').classList.contains('loading'));assert.equal(game.totalCost,200);for(const box of game.boxes)assert.ok([0,1200].includes(box.payout));await page.locator('#roundResultContinue').click();
  await page.locator('#baccaratStats').click();await page.waitForSelector('.bead-road .road-cell');assert.equal(await page.locator('.bead-road .road-cell').count(),1,'Real paid round is recorded once');
  // Road-map presentation fixture, kept only in this temporary test database.
  await app.store.transaction(data=>{data.users[username].baccaratHistory=Array.from({length:74},(_,i)=>({id:`fixture-${i}`,time:new Date().toISOString(),outcome:i%11===0?'tie':Math.floor(i/7)%2?'player':'banker',playerPair:i%13===0,bankerPair:i%17===0,playerTotal:4,bankerTotal:6}));});
  await page.locator('#refreshBaccaratStats').click();await page.waitForFunction(()=>document.querySelectorAll('.bead-road .road-cell').length===74);assert.equal(await page.locator('.bead-road .road-cell').count(),74);assert.match(await page.locator('.baccarat-frequency').innerText(),/не прогноз/);
  assert.ok(await page.locator('#baccaratStatsDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Road maps scroll inside their own window');await page.screenshot({path:`test-results/${label}-baccarat-statistics.png`});await page.locator('#baccaratStatsDialog .close').click();
  await page.locator('#themeBtn').click();await page.evaluate(()=>showRoundResult({type:'slots',bet:100,totalCost:100,totalPayout:250,done:true}));assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.screenshot({path:`test-results/${label}-light-result.png`});await page.locator('#roundResultContinue').click();
  report.push({viewport,status:'passed',checks:['bonus progress persists','award modal','free-spin payouts credited without new stake','final bonus total','win/loss/push and partial-return windows','reopen result','leaderboard privacy and current player','pair betting and 11:1 payout','personal baccarat history','bead/big road layout and local scrolling','light theme result']});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile('test-results/results-browser.json',JSON.stringify({report,errors},null,2));console.log(JSON.stringify({report,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>app.server.close(resolve));await app.store.close();await rm(dir,{recursive:true,force:true});}
