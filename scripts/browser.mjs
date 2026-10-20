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
const errors=[];
await mkdir('test-results',{recursive:true});
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const mobile=viewport.width<500;
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',async r=>{if(r.url().includes('/api/')&&r.ok()){const value=await r.json().catch(()=>null);if(value){const raw=JSON.stringify(value);for(const field of ['passwordHash','"deck"','"salt"',...(!value.game?.done?['mineCells','crashPoint']:[])])if(raw.includes(field))errors.push(`Private field in API: ${field}`);}}});
  await page.goto(url);
  await page.waitForSelector('main > *');
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body),'Keyboard focus reaches control');
  assert.equal(await page.title(),'NEON ARCADE — клуб виртуальных игр');
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
   return body;
  };
  await page.locator('#accountBtn').click();await page.locator('#authSwitch').click();
  await page.locator('[name=username]').fill(username);await page.locator('[name=password]').fill('Browser-password-2026');
  await clickRequest('#authSubmit','register');await page.waitForFunction(()=>!document.querySelector('#authDialog').open);
  assert.match(await page.locator('#accountBtn').innerText(),new RegExp(username));
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
  await open('roulette');await page.locator('[data-chip="100"]').click();
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
  await open('blackjack');await clickRequest('#startBtn','game/start');await finish();
  await open('russian');await clickRequest('#startBtn','game/start');await page.locator('[data-card="0"]').click();await clickRequest('[data-action=exchange]','game/action');await finish();
  await open('threecard');await page.locator('#pairPlus').fill('10');await clickRequest('#startBtn','game/start');await finish();
  await open('holdem');await clickRequest('#startBtn','game/start');await clickRequest('[data-action=check]','game/action');await clickRequest('[data-action=bet]','game/action');
  await open('baccarat');await clickRequest('#startBtn','game/start');
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
  await open('slots');await clickRequest('#startBtn','game/start');await finish();
  await open('crash');await clickRequest('#startBtn','game/start');await clickRequest('[data-action=cashout]','game/action');
  await page.locator('#accountBtn').click();await clickRequest('#logoutBtn','logout');
  await page.locator('#accountBtn').click();if(await page.locator('#authSubmit').innerText()==='Создать аккаунт')await page.locator('#authSwitch').click();await page.locator('[name=username]').fill(username);await page.locator('[name=password]').fill('Browser-password-2026');await clickRequest('#authSubmit','login');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#accountBtn').textContent.includes('browser_'));
  const me=await (await context.request.get(url+'/api/me')).json();assert.equal(me.history.length,10);assert.equal(me.game.done,true);
  if(await page.locator('#historyNav').isVisible())await page.locator('#historyNav').click();else {await page.locator('#accountBtn').click();await page.locator('#profileHistoryBtn').click();}assert.equal(await page.locator('.history-table tbody tr').count(),10);
  assert.ok(await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)<=innerWidth+1),'Horizontal overflow');
  await context.close();
  report.push({viewport,status:'passed',checks:['scene carousel and featured game navigation','light theme and persistence','320px layout and reduced motion','all four roulette series: positions, amounts and totals','new roulette stake after completed round','keyboard focus','register/login/logout/persistence','search and categories','roulette single and boundary split','blackjack','russian exchange','threecard Pair Plus','holdem check/bet','baccarat','dice invalid stake and recovery','mines reveal/cashout','slots','crash cashout','history','no overflow','no hidden active game fields']});
 }
 assert.deepEqual(errors,[]);
 await writeFile('test-results/browser.json',JSON.stringify({report,errors},null,2));
 console.log(JSON.stringify({report,errors},null,2));
}finally{await browser.close();await new Promise(r=>app.server.close(r));await app.store.close();await rm(dataDir,{recursive:true,force:true});}
