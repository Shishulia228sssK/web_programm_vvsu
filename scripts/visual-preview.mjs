import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
const dataDir=await mkdtemp(path.join(os.tmpdir(),'casino-preview-'));
const app=await createApp({dataDir});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({args:['--no-sandbox']});
await mkdir('test-results',{recursive:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.waitForSelector('.showcase-wheel .wheel-face');
 await page.waitForTimeout(4200);
 assert.equal(await page.locator('body').getAttribute('data-design-version'),'aurora-photos-v1');
 const angle=await page.locator('.showcase-wheel .wheel-face').evaluate(e=>getComputedStyle(e).transform);
 await page.waitForTimeout(250);
 assert.notEqual(await page.locator('.showcase-wheel .wheel-face').evaluate(e=>getComputedStyle(e).transform),angle,'Hero roulette rotates');
 await page.screenshot({path:'test-results/photo-lobby-desktop.png',fullPage:true});
 for(const type of ['slots','crash']){
  await page.locator('.immersive-game[data-hero-index="'+(type==='slots'?2:3)+'"]').click();
  await page.waitForTimeout(type==='slots'?2500:1500);
  if(type==='slots'){
   assert.equal(await page.locator('.showcase-slot-track').count(),3);
   const before=await page.locator('.showcase-slot-track').first().evaluate(e=>getComputedStyle(e).transform);
   await page.waitForTimeout(200);
   assert.notEqual(await page.locator('.showcase-slot-track').first().evaluate(e=>getComputedStyle(e).transform),before,'Hero slot reels move');
  }
  await page.screenshot({path:'test-results/photo-hero-'+type+'.png'});
  if(type==='crash'){await page.waitForFunction(()=>document.querySelector('.immersive-object').dataset.rocketGone==='true');}
 }
 await page.locator('#motionToggle').click();
 assert.equal(await page.locator('body').getAttribute('data-casino-motion'),'paused');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('.immersive-game[data-hero-index="0"]').click();
 await page.screenshot({path:'test-results/photo-hero-paused.png'});
 await page.setViewportSize({width:390,height:844});
 await page.goto(base);
 await page.waitForSelector('.poster');
 await page.screenshot({path:'test-results/photo-lobby-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No mobile overflow');
 const preview=await page.screenshot({type:'jpeg',quality:45});
 const data=preview.toString('base64');
 for(let i=0;i<data.length;i+=8000)console.log('PREVIEW_PART:'+data.slice(i,i+8000));
 const photos=await page.locator('.poster-art img').evaluateAll(els=>els.map(e=>({src:e.src,loaded:e.complete&&e.naturalWidth>0,fallback:!!e.dataset.fallback})));
 await writeFile('test-results/photo-assets.json',JSON.stringify(photos,null,2));
 assert.equal(errors.length,0,errors.join('; '));
 console.log('PHOTO_MOTION_CHECKS_PASSED');
 try{const live=await fetch('https://web-programm-vvsu.onrender.com/?check=aurora-photos-v1',{signal:AbortSignal.timeout(45000)});const html=await live.text();console.log('RENDER_CHECK:'+JSON.stringify({status:live.status,hasNewDesign:html.includes('aurora-photos-v1')}));}catch(e){console.log('RENDER_CHECK:'+e.message)}
}finally{await browser.close();await new Promise(r=>app.server.close(r));await rm(dataDir,{recursive:true,force:true});}
