import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
async function fixture(t,dir){dir??=await mkdtemp(path.join(os.tmpdir(),'arcade-test-'));const app=await createApp({dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));return {...app,dir,url:`http://127.0.0.1:${app.server.address().port}`};}
async function request(app,url,body,cookie='',headers={}){const r=await fetch(app.url+url,{method:body?'POST':'GET',headers:{'content-type':'application/json',cookie,...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function register(app,name='tester'){return request(app,'/api/register',{username:name,password:'test-password-strong'});}
test('account sessions, password hashing, idempotency, concurrency, persistence, hidden state',async t=>{const app=await fixture(t);t.after(()=>rm(app.dir,{recursive:true,force:true}));const reg=await register(app);assert.equal(reg.status,200);assert.match(reg.cookie,/arcade_session=/);assert.equal(reg.body.user.balance,50000);const cookie=reg.cookie;const stored=app.store.data.users.tester;assert.notEqual(stored.passwordHash,'test-password-strong');assert.equal(stored.passwordHash.length,128);assert.equal((await request(app,'/api/me')).status,401);
 const start={type:'mines',bet:100,options:{mines:3},version:0,requestId:'start-mines-0001'};const r=await request(app,'/api/game/start',start,cookie);assert.equal(r.status,200);assert.equal(r.body.user.balance,49900);assert.equal(r.body.game.mineCells,undefined);assert.equal((await request(app,'/api/game/start',start,cookie)).body.user.balance,49900);assert.equal((await request(app,'/api/game/start',{...start,bet:200},cookie)).status,409);
 const cell=Array.from({length:25},(_,i)=>i).find(i=>!app.store.data.users.tester.game.mineCells.includes(i));const concurrent=await Promise.all([1,2].map(i=>request(app,'/api/game/action',{action:'reveal',options:{cell},version:1,requestId:`reveal-cell-${i}`},cookie)));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 await new Promise(r=>app.server.close(r));await app.store.close();const app2=await fixture(t,app.dir);const restored=await request(app2,'/api/me',undefined,cookie);assert.equal(restored.body.user.balance,49900);assert.equal(restored.body.game.revealed.length,1);assert.equal(restored.body.version,2);
 const cash=await request(app2,'/api/game/action',{action:'cashout',version:2,requestId:'cashout-0001'},cookie);assert.equal(cash.status,200);assert.equal(cash.body.history.length,1);assert.equal(cash.body.game.done,true);assert.equal((await request(app2,'/api/logout',{},cookie)).status,200);assert.equal((await request(app2,'/api/me',undefined,cookie)).status,401);const login=await request(app2,'/api/login',{username:'tester',password:'test-password-strong'});assert.equal(login.status,200);assert.equal(login.body.user.balance,cash.body.user.balance);
});
test('reject malicious stakes, client payout, origins and topups',async t=>{const app=await fixture(t);t.after(()=>rm(app.dir,{recursive:true,force:true}));const {cookie}=await register(app);for(const bet of [-10,0,1.5,100001,'100',null])assert.equal((await request(app,'/api/game/start',{type:'dice',bet,version:0,requestId:'invalid-bet-0001'},cookie)).status,400);assert.equal((await request(app,'/api/game/start',{type:'dice',bet:100,options:{threshold:100},version:0,requestId:'invalid-dice-001'},cookie)).status,400);assert.equal((await request(app,'/api/topup',{version:0,requestId:'topup-request-01'},cookie)).status,400);assert.equal((await request(app,'/api/topup',{},cookie,{origin:'https://evil.example'})).status,403);const r=await request(app,'/api/game/start',{type:'dice',bet:100,version:0,requestId:'valid-dice-0001',balance:999999,payout:999999,result:'win'},cookie);assert.equal(r.status,200);assert.ok(r.body.user.balance<51000);});
test('atomic file backup recovery',async t=>{const app=await fixture(t);t.after(()=>rm(app.dir,{recursive:true,force:true}));await register(app);await new Promise(r=>app.server.close(r));await app.store.close();await writeFile(path.join(app.dir,'arcade.json'),'{broken');const recovered=await fixture(t,app.dir);assert.equal(recovered.store.data.users.tester.balance,50000);});

test('roulette API allows one coin and rejects per-position limit bypass without changing balance',async t=>{
 const app=await fixture(t);t.after(()=>rm(app.dir,{recursive:true,force:true}));const {cookie}=await register(app);
 const invalid=[{bet:501,bets:[{numbers:[1],amount:501}]},{bet:501,bets:[{numbers:[1,2],amount:250},{numbers:[2,1],amount:251}]},{bet:24,bets:[{numbers:Array.from({length:18},(_,i)=>i+1),amount:24}]}];
 for(const [i,example] of invalid.entries()){const r=await request(app,'/api/game/start',{type:'roulette',bet:example.bet,options:{bets:example.bets},version:0,requestId:'limit-invalid-'+i},cookie);assert.equal(r.status,400);}
 const before=await request(app,'/api/me',undefined,cookie);assert.equal(before.body.version,0);assert.equal(before.body.user.balance,50000);
 const body={type:'roulette',bet:1,options:{bets:[{numbers:[1],amount:1}]},version:0,requestId:'roulette-one-coin'};
 const r=await request(app,'/api/game/start',body,cookie);assert.equal(r.status,200);assert.equal(r.body.game.totalCost,1);assert.equal(r.body.user.balance,49999+r.body.game.totalPayout);assert.equal((await request(app,'/api/game/start',body,cookie)).body.user.balance,r.body.user.balance);
});
test('multi-box API charges actual total once and exposes payouts without deck',async t=>{
 const app=await fixture(t);t.after(()=>rm(app.dir,{recursive:true,force:true}));const {cookie}=await register(app);
 const body={type:'baccarat',bet:300,options:{boxes:[{box:0,bet:100,selection:'player'},{box:0,bet:100,selection:'banker'},{box:0,bet:100,selection:'tie'}]},version:0,requestId:'baccarat-boxes-01'};
 const r=await request(app,'/api/game/start',body,cookie);assert.equal(r.status,200);assert.equal(r.body.game.boxes.length,3);assert.equal(r.body.game.totalCost,300);assert.equal(r.body.game.totalPayout,r.body.game.boxes.reduce((s,b)=>s+b.payout,0));assert.equal(r.body.user.balance,49700+r.body.game.totalPayout);assert.equal(r.body.game.deck,undefined);assert.equal((await request(app,'/api/game/start',body,cookie)).body.user.balance,r.body.user.balance);
 const invalid=await request(app,'/api/game/start',{type:'blackjack',bet:100,options:{boxes:[{box:0,bet:100},{box:1,bet:100}]},version:r.body.version,requestId:'blackjack-total-01'},cookie);assert.equal(invalid.status,400);
 const valid=await request(app,'/api/game/start',{type:'blackjack',bet:200,options:{boxes:[{box:0,bet:100},{box:1,bet:100}]},version:r.body.version,requestId:'blackjack-boxes-01'},cookie);assert.equal(valid.status,200);assert.equal(valid.body.game.hands.length,2);assert.equal(valid.body.game.totalCost,200);assert.equal(valid.body.game.deck,undefined);
 await new Promise(r=>app.server.close(r));await app.store.close();const restored=await fixture(t,app.dir);const me=await request(restored,'/api/me',undefined,cookie);assert.equal(me.body.game.hands.length,2);assert.equal(me.body.version,valid.body.version);assert.equal(me.body.user.balance,valid.body.user.balance);
});

test('public leaderboard sorts balances and exposes only rank, username and balance',async t=>{
 const app=await fixture(t);t.after(()=>rm(app.dir,{recursive:true,force:true}));
 const empty=await request(app,'/api/leaderboard');assert.equal(empty.status,200);assert.deepEqual(empty.body,{totalPlayers:0,players:[]});
 for(const name of ['first_player','second_player','third_player'])await register(app,name);
 await app.store.transaction(d=>{d.users.first_player.balance=100;d.users.second_player.balance=300;d.users.third_player.balance=200;});
 const r=await request(app,'/api/leaderboard');assert.equal(r.status,200);assert.equal(r.body.totalPlayers,3);assert.deepEqual(r.body.players.map(p=>p.username),['second_player','third_player','first_player']);assert.deepEqual(r.body.players.map(p=>p.rank),[1,2,3]);
 for(const p of r.body.players)assert.deepEqual(Object.keys(p).sort(),['balance','rank','username']);
});

test('baccarat pair results persist in an authenticated personal history exactly once',async t=>{
 const app=await fixture(t);t.after(()=>rm(app.dir,{recursive:true,force:true}));assert.equal((await request(app,'/api/baccarat-stats')).status,401);
 const {cookie}=await register(app,'pair_history');const body={type:'baccarat',bet:20,options:{boxes:[{box:0,selection:'playerPair',bet:10},{box:0,selection:'bankerPair',bet:10}]},version:0,requestId:'pair-history-0001'};
 const r=await request(app,'/api/game/start',body,cookie);assert.equal(r.status,200);assert.equal(r.body.game.totalCost,20);for(const b of r.body.game.boxes)assert.ok([0,120].includes(b.payout));
 await request(app,'/api/game/start',body,cookie);const stats=await request(app,'/api/baccarat-stats',undefined,cookie);assert.equal(stats.status,200);assert.equal(stats.body.rounds.length,1);assert.equal(stats.body.rounds[0].outcome,r.body.game.outcome);assert.equal(stats.body.rounds[0].playerPair,r.body.game.playerPair);assert.equal(stats.body.rounds[0].bankerPair,r.body.game.bankerPair);
 const other=await register(app,'other_history');assert.deepEqual((await request(app,'/api/baccarat-stats',undefined,other.cookie)).body.rounds,[]);
 await new Promise(r=>app.server.close(r));await app.store.close();const restored=await fixture(t,app.dir);assert.deepEqual((await request(restored,'/api/baccarat-stats',undefined,cookie)).body.rounds,stats.body.rounds);
});

test('Telegram HTTPS cookie mode requires Secure and allows only trusted frame origins',async t=>{
 await assert.rejects(createApp({secure:false,sameSite:'None'}),/COOKIE_SECURE/);
 const dir=await mkdtemp(path.join(os.tmpdir(),'ludka-telegram-')),app=await createApp({dataDir:dir,secure:true,sameSite:'None'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));await app.store.close();await rm(dir,{recursive:true,force:true});});
 const url=`http://127.0.0.1:${app.server.address().port}`,r=await fetch(url+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'tg_cookie',password:'test-cookie-password'})});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/SameSite=None/);assert.match(r.headers.get('set-cookie'),/; Secure/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'self' https:\/\/web.telegram.org/);assert.match(r.headers.get('content-security-policy'),/script-src 'self' https:\/\/telegram.org/);
 assert.equal((await fetch(url+'/telegram.js')).status,200);
});
