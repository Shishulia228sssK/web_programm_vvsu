import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
const dataDir=await mkdtemp(path.join(os.tmpdir(),'neon-browser-'));
const app=await createApp({dataDir});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const report=[];
const errors=[],resultTypes=new Set();
await mkdir('test-results',{recursive:true});
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const mobile=viewport.width<500;
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
  page.on('response',async r=>{if(r.url().includes('/api/')&&r.ok()){const value=await r.json().catch(()=>null);if(value){const raw=JSON.stringify(value);for(const field of ['passwordHash','"deck"','"salt"',...(!value.game?.done?['mineCells','crashPoint']:[])])if(raw.includes(field))errors.push(`Private field in API: ${field}`);}}});
  await page.goto(url);
  await page.waitForSelector('main > *');
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body),'Keyboard focus reaches control');
  assert.equal(await page.title(),'ЛУДКА.COM — клуб виртуальных игр');
  const sceneStyle=await context.request.get(url+'/scene.css');assert.equal(sceneStyle.status(),200,'Scene stylesheet served');
  assert.equal(await page.locator('.scene-hero').evaluate(e=>getComputedStyle(e).display),'block','Scene layout stylesheet applied');
  await page.locator('#sceneNext').click();assert.equal(await page.locator('#sceneCounter').innerText(),'02 / 04');
  assert.equal(await page.locator('.scene-card-front').getAttribute('data-featured'),'blackjack');
  await page.locator('#scenePrev').click();assert.equal(await page.locator('.scene-card-front').getAttribute('data-featured'),'roulette');
  if(!mobile){
   await page.emulateMedia({reducedMotion:'no-preference'});
   const area=await page.locator('#sceneViewport').boundingBox();
   await page.mouse.move(area.x+area.width*.7,area.y+area.height*.6);
   assert.notEqual(await page.locator('#sceneStack').evaluate(e=>e.style.getPropertyValue('--tilt-y')),'','Pointer moves the spatial card stack');
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator('#sceneStack').evaluate(e=>getComputedStyle(e).transform),'none','Reduced motion disables parallax');
  }
  await page.locator('#themeBtn').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.reload();await page.waitForSelector('.scene-hero');assert.equal(await page.locator('html').getAttribute('data-theme'),'light','Theme retained after reload');
  await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-light.png`,fullPage:true});
  await page.locator('#themeBtn').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.locator('.scene-card-front').click();assert.ok(await page.locator('.roulette-board').isVisible(),'Featured card opens its game');
  await page.locator('#backBtn').click();
  assert.equal(await page.locator('.title-star').evaluate(e=>getComputedStyle(e).animationName),'none','Reduced motion disables decorative animation');
  if(mobile){await page.setViewportSize({width:320,height:720});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'320px lobby has no overflow');await page.setViewportSize(viewport);}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Lobby has no horizontal overflow');
  await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-lobby.png`,fullPage:true});
  const username=mobile?'browser_mobile':'browser_desktop';
  const clickRequest=async(selector,endpoint)=>{
   const response=page.waitForResponse(r=>r.url().endsWith('/api/'+endpoint)&&r.request().method()==='POST');
   await page.locator(selector).click();const r=await response;const body=await r.json();assert.equal(r.status(),200,JSON.stringify(body));
   await page.waitForFunction(()=>!document.querySelector('#main').classList.contains('loading'));
   if(body.game?.done&&endpoint.startsWith('game/')){
    const slots=body.game.type==='slots';const result=page.locator(slots?'.slot-feedback':'#roundResultDialog .round-result');assert.equal(await page.locator('#roundResultDialog').evaluate(e=>e.open),!slots,'Slots stay nonmodal; other completed games open result window');
    if(!slots)assert.equal(Number(await result.getAttribute('data-cost')),body.game.totalCost);assert.equal(Number(await result.getAttribute('data-payout')),body.game.totalPayout);assert.equal(Number(await result.getAttribute('data-net')),body.game.totalPayout-body.game.totalCost);
    assert.equal(Number(await result.getAttribute('data-stake')),body.game.originatingStake??body.game.bet);resultTypes.add(body.game.type);
   }
   if(await page.locator('#roundResultDialog').evaluate(e=>e.open))await page.locator('#roundResultContinue').click();
   return body;
  };
  await page.locator('#accountBtn').click();await page.locator('#authSwitch').click();
  await page.locator('[name=username]').fill(username);await page.locator('[name=password]').fill('Browser-password-2026');
  await clickRequest('#authSubmit','register');await page.waitForFunction(()=>!document.querySelector('#authDialog').open);
  assert.match(await page.locator('#accountBtn').innerText(),new RegExp(username));
  await page.locator(mobile?'#leaderboardFooter':'#leaderboardNav').click();await page.waitForSelector('.leaderboard-table');assert.equal(await page.locator('.your-rank').count(),1);assert.match(await page.locator('.your-rank').innerText(),new RegExp(username));await page.locator('#leaderboardDialog .close').click();
  await page.locator('#search').fill('рулетка');assert.equal(await page.locator('[data-game]').count(),1);
  await page.locator('#search').fill('несуществующая');assert.equal(await page.locator('[data-game]').count(),0);
  await page.locator('#search').fill('');await page.locator('[data-category=cards]').click();assert.equal(await page.locator('[data-game]').count(),4);
  await page.locator('[data-category=all]').click();assert.equal(await page.locator('[data-game]').count(),10);
  const open=async type=>{console.log(`${mobile?'mobile':'desktop'}: ${type}`);if(await page.locator('#backBtn').count())await page.locator('#backBtn').click();await page.locator(`[data-game=${type}]`).click();};
  const finish=async()=>{for(let i=0;i<100;i++){
   const current=await (await context.request.get(url+'/api/me')).json();if(current.game.done)return current;
   let selector;if(current.game.type==='blackjack')selector=current.game.phase==='insurance'?'[data-action=declineInsurance]':'[data-action=stand]';
   else if(current.game.type==='slots')selector=current.game.bonusRounds?'[data-bonus="0"]':'[data-action=spin]';
   else selector='[data-action=play]';await clickRequest(selector,'game/action');
  }throw Error('Round did not terminate');};
  await open('roulette');
  await page.locator('#clearBet').click();await page.locator('[data-chip="1"]').click();await page.locator('[data-numbers="17"]').click();assert.match(await page.locator('.bet-list').innerText(),/17 · 1/);
  await page.locator('#clearBet').click();await page.locator('[data-chip="500"]').click();await page.locator('[data-numbers="17"]').click();await page.locator('[data-numbers="17"]').click();assert.equal(await page.locator('[data-numbers="17"] .chip-marker').innerText(),'500','Repeated chips cannot exceed inside cap');
  await page.locator('#clearBet').click();await page.locator('[data-chip="25"]').click();await page.locator('.outside-bets [data-numbers]').first().click();assert.equal(Number((await page.locator('#cost').innerText()).replace(/\D/g,'')),25,'Outside minimum');
  await page.locator('#clearBet').click();await page.locator('[data-chip="2000"]').click();await page.locator('.outside-bets [data-numbers]').first().click();await page.locator('.outside-bets [data-numbers]').first().click();assert.equal(Number((await page.locator('#cost').innerText()).replace(/\D/g,'')),2000,'Outside cap applies to aggregated chips');
  await page.locator('#clearBet').click();await page.locator('[data-chip="100"]').click();
  const seriesCases={
   voisins:{chips:9,bets:[[[0,2,3],2],[[25,26,28,29],2],[[4,7],1],[[12,15],1],[[18,21],1],[[19,22],1],[[32,35],1]]},
   tiers:{chips:6,bets:[[[5,8],1],[[10,11],1],[[13,16],1],[[23,24],1],[[27,30],1],[[33,36],1]]},
   orphelins:{chips:5,bets:[[[1],1],[[6,9],1],[[14,17],1],[[17,20],1],[[31,34],1]]},
   zero:{chips:4,bets:[[[26],1],[[0,3],1],[[12,15],1],[[32,35],1]]}
  };
  const money=text=>Number(text.replace(/[^0-9]/g,''));
  for(const [name,expected] of Object.entries(seriesCases)){
   await page.locator('#clearBet').click();
   await page.locator(`[data-series="${name}"]`).click();
   assert.equal(money(await page.locator('#cost').innerText()),expected.chips*100,`${name}: total stake`);
   assert.equal(await page.locator('.roulette-board .chip-marker').count(),expected.bets.length,`${name}: every component has a chip on the board`);
   for(const [numbers,count] of expected.bets){
    const target=page.locator(`.roulette-board [data-numbers="${numbers.join(',')}"]`);
    assert.equal(await target.locator('.chip-marker').innerText(),String(count*100));
    const centered=await target.evaluate(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('.chip-marker').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1&&Math.abs(a.y+a.height/2-b.y-b.height/2)<1;});
    assert.ok(centered,`${name}: ${numbers} chip centered on betting position`);
    const onNumbers=await target.evaluate((e,numbers)=>{
     const rects=numbers.filter(n=>n!==0).map(n=>document.querySelector(`.roulette-number[data-numbers="${n}"]`).getBoundingClientRect());
     const r=e.getBoundingClientRect();
     const x=numbers.includes(0)?rects[0].left:rects.reduce((s,r)=>s+r.x+r.width/2,0)/rects.length;
     const y=rects.reduce((s,r)=>s+r.y+r.height/2,0)/rects.length;
     return Math.abs(r.x+r.width/2-x)<1&&Math.abs(r.y+r.height/2-y)<1;
    },numbers);
    assert.ok(onNumbers,`${name}: ${numbers} position matches the covered cells`);
   }
  }
  await page.locator('#clearBet').click();await page.locator('[data-numbers="17"]').click();await page.locator('.bet-spot[data-numbers="3,6"]').click();assert.match(await page.locator('.bet-list').textContent(),/3\/6/);
  if(mobile){const sizes=await page.locator('.roulette-scroll').evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth}));assert.ok(sizes.scroll>sizes.width,'Mobile roulette scrolls inside its field');assert.ok(await page.locator('.roulette-number').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=14),'Mobile roulette numbers are readable');assert.ok(await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)<=innerWidth+1),'Roulette does not overflow page');}
  const roulette=await clickRequest('#startBtn','game/start');assert.equal(roulette.game.done,true);assert.equal(roulette.game.totalCost,200);assert.equal(roulette.game.bets.length,2);
  await page.locator('#clearBet').click();
  await page.locator('[data-series="voisins"]').click();
  assert.equal(money(await page.locator('#cost').innerText()),900,'New stake replaces previous round cost');
  await page.locator('#clearBet').click();
  await page.locator('[data-series="zero"]').click();
  assert.equal(money(await page.locator('#cost').innerText()),400,'Zero series cost after completed round');
  const wheel=await page.locator('.wheel-face').evaluate(e=>({degrees:parseFloat(e.style.getPropertyValue('--wheel-turn')),matrix:Array.from(new DOMMatrix(getComputedStyle(e).transform).toFloat64Array())}));
  assert.ok(Math.abs(wheel.matrix[0]-Math.cos(wheel.degrees*Math.PI/180))<.001,'Wheel finishes at server result');
  await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-roulette.png`,fullPage:true});
  await open('blackjack');assert.equal(await page.locator('.betting-box').count(),5);
  await page.locator('#clearBoxes').click();await page.locator('[data-box="0"]').click();await page.locator('[data-box="2"]').click();
  const blackjack=await clickRequest('#startBtn','game/start');assert.equal(blackjack.game.hands.length,2);assert.deepEqual(blackjack.game.hands.map(h=>h.box),[0,2]);assert.equal(blackjack.game.totalCost,200);
  if(!blackjack.game.done){await page.reload();await page.waitForSelector('.betting-box');}
  if(!blackjack.game.done)assert.ok(await page.locator('.box-active').count()===1||blackjack.game.phase==='insurance');
  await finish();await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-blackjack-boxes.png`,fullPage:true});
  await open('russian');await clickRequest('#startBtn','game/start');await page.locator('[data-card="0"]').click();await clickRequest('[data-action=exchange]','game/action');await finish();
  await open('threecard');await page.locator('#pairPlus').fill('10');await clickRequest('#startBtn','game/start');await finish();
  await open('holdem');await clickRequest('#startBtn','game/start');await clickRequest('[data-action=check]','game/action');await clickRequest('[data-action=bet]','game/action');
  await open('baccarat');assert.equal(await page.locator('.box-bet').count(),5);
  await page.locator('#clearBoxes').click();await page.locator('[data-box="0"][data-box-side="player"]').click();await page.locator('[data-box="0"][data-box-side="banker"]').click();await page.locator('[data-box="0"][data-box-side="tie"]').click();
  const baccarat=await clickRequest('#startBtn','game/start');assert.equal(baccarat.game.boxes.length,3);assert.equal(baccarat.game.totalCost,300);assert.equal(baccarat.game.totalPayout,baccarat.game.boxes.reduce((sum,b)=>sum+b.payout,0));
  await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-baccarat-boxes.png`,fullPage:true});
  await open('dice');
  const beforeInvalid=await (await context.request.get(url+'/api/me')).json();
  await page.locator('#bet').fill('15');
  const invalidResponse=page.waitForResponse(r=>r.url().endsWith('/api/game/start')&&r.request().method()==='POST');
  await page.locator('#startBtn').click();assert.equal((await invalidResponse).status(),400);
  await page.waitForFunction(()=>!document.querySelector('#main').classList.contains('loading'));
  const afterInvalid=await (await context.request.get(url+'/api/me')).json();
  assert.equal(afterInvalid.user.balance,beforeInvalid.user.balance);assert.equal(afterInvalid.version,beforeInvalid.version);
  assert.match(await page.locator('#toast').textContent(),/Ставка/);await page.locator('#bet').fill('100');
  await page.locator('#threshold').fill('70');const dice=await clickRequest('#startBtn','game/start');assert.equal(dice.game.done,true);
  await open('mines');await page.locator('#mines').selectOption('1');await clickRequest('#startBtn','game/start');
  // Choose a safe cell from isolated server fixture so cashout is deterministic.
  const safe=Array.from({length:25},(_,i)=>i).find(i=>!app.store.data.users[username].game.mineCells.includes(i));
  const mine=await clickRequest(`[data-cell="${safe}"]`,'game/action');assert.equal(mine.game.revealed.length,1);assert.equal(mine.game.mineCells,undefined);
  await clickRequest('[data-action=cashout]','game/action');
  await open('slots');await page.waitForSelector('.slot-guide table');assert.equal(await page.locator('.slot-guide tbody tr').count(),7);assert.match(await page.locator('.slot-guide').innerText(),/8 FREE SPINS/);await page.locator('#slotPayouts').click();await page.waitForSelector('.payout-table tbody tr');assert.equal(await page.locator('.payout-table tbody tr').count(),7);assert.match(await page.locator('#slotPayoutContent').innerText(),/150×/);assert.doesNotMatch(await page.locator('#slotPayoutContent').innerText(),/undefined/);assert.match(await page.locator('#slotPayoutContent').innerText(),/2× \/ 3× \/ 5×/);
  await page.locator('#slotPayoutDialog .close').click();assert.equal(await page.locator('#slotPayoutDialog').evaluate(e=>e.open),false);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const slotRequest=clickRequest('#startBtn','game/start');await page.waitForSelector('.slot-machine.spinning');
  assert.equal(await page.locator('.slot-reel').count(),5);assert.notEqual(await page.locator('.reel-strip').first().evaluate(e=>getComputedStyle(e).animationName),'none');
  const slots=await slotRequest;assert.equal(await page.locator('.slot-machine.spinning').count(),0);
  const symbols=['♠','♥','♦','♣','7','★','W','S'];
  for(let col=0;col<5;col++)assert.deepEqual((await page.locator('.slot-reel').nth(col).locator('.slot-symbol').allTextContents()).slice(-3),slots.game.grid[col].map(n=>symbols[n]),'Reels end at actual server result');
  assert.ok(await page.locator('.slot-reel').evaluateAll(reels=>reels.every(reel=>{const window=reel.getBoundingClientRect();return [...reel.querySelectorAll('.slot-symbol')].slice(-3).every(symbol=>{const r=symbol.getBoundingClientRect();return r.top>=window.top-1&&r.bottom<=window.bottom+1;});})),'Final server symbols are visibly inside the stopped reel windows');
  await page.emulateMedia({reducedMotion:'reduce'});await finish();
  await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-slots.png`,fullPage:true});
  await open('crash');await clickRequest('#startBtn','game/start');await clickRequest('[data-action=cashout]','game/action');
  await page.locator('#accountBtn').click();await clickRequest('#logoutBtn','logout');
  await page.locator('#accountBtn').click();if(await page.locator('#authSubmit').innerText()==='Создать аккаунт')await page.locator('#authSwitch').click();await page.locator('[name=username]').fill(username);await page.locator('[name=password]').fill('Browser-password-2026');await clickRequest('#authSubmit','login');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#accountBtn').textContent.includes('browser_'));
  const me=await (await context.request.get(url+'/api/me')).json();assert.equal(me.history.length,10);assert.equal(me.game.done,true);
  if(await page.locator('#historyNav').isVisible())await page.locator('#historyNav').click();else {await page.locator('#accountBtn').click();await page.locator('#profileHistoryBtn').click();}assert.equal(await page.locator('.history-table tbody tr').count(),10);
  assert.ok(await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)<=innerWidth+1),'Horizontal overflow');
  await context.close();
  report.push({viewport,status:'passed',checks:['all ten results: slots nonmodal, other result windows','public leaderboard with current player','compact slot coefficients and free spin rules','scene carousel and featured game navigation','light theme and persistence','320px layout and reduced motion','all four roulette series: positions, amounts and totals','new roulette stake after completed round','keyboard focus','register/login/logout/persistence','search and categories','roulette single and boundary split','five-seat blackjack and active hand restoration','russian exchange','threecard Pair Plus','holdem check/bet','single-box baccarat and independent payouts','dice invalid stake and recovery','mines reveal/cashout','slot reel animation and server result','slot payout dialog','roulette aggregated limits','crash cashout','history','no overflow','no hidden active game fields']});
 }
 assert.deepEqual(errors,[]);assert.equal(resultTypes.size,10,'All ten games show correct result windows');
 await writeFile('test-results/browser.json',JSON.stringify({report,errors},null,2));
 console.log(JSON.stringify({report,errors},null,2));
}finally{await browser.close();await new Promise(r=>app.server.close(r));await app.store.close();await rm(dataDir,{recursive:true,force:true});}
