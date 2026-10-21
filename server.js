import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {Store} from './lib/store.js';
import {startCardGame,actCardGame,publicCardGame,RULES as cards} from './lib/card-games.js';
import {startChanceGame,actChanceGame,publicChanceGame,RULES as chance,SLOT_MATH} from './lib/chance-games.js';
const scrypt=promisify(scryptCallback), root=path.dirname(fileURLToPath(import.meta.url));
const cardTypes=new Set(['blackjack','russian','threecard','holdem','baccarat']);
const chanceTypes=new Set(['roulette','dice','mines','crash','slots']);
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function createApp({dataDir=process.env.DATA_DIR||path.join(root,'data'),secure=process.env.COOKIE_SECURE==='true'}={}) {
 const store=new Store(dataDir);await store.init();const rates=new Map();
 function snapshot(u){return {user:{username:u.username,balance:u.balance},version:u.version,game:u.game?(cardTypes.has(u.game.type)?publicCardGame(u.game):publicChanceGame(u.game)):null,history:u.history.slice(-100).reverse(),rules:{cards,chance}};}
 function session(req,d){const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('arcade_session='))?.slice(15);const s=raw&&d.sessions[hash(raw)];if(!s||s.expires<Date.now()||!d.users[s.user])throw fail(401,'Войдите в аккаунт');return d.users[s.user];}
 function rate(req){const key=req.socket.remoteAddress;const now=Date.now();let r=rates.get(key);if(!r||r.until<now){r={count:0,until:now+60000};rates.set(key,r);}if(++r.count>40)throw fail(429,'Слишком много попыток. Подождите минуту.');if(rates.size>10000)for(const [k,v]of rates)if(v.until<now)rates.delete(k);}
 const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
 const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
 try {if(store.failure)throw fail(503,'Хранилище недоступно. Требуется перезапуск после проверки диска.');const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/api/')){if(req.method!=='GET'&&req.method!=='HEAD')throw fail(405,'Method not allowed');const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/scene.css':'scene.css','/app.js':'app.js','/baccarat-roads.js':'baccarat-roads.js'};const file=files[url.pathname];if(!file)throw fail(404,'Not found');const data=await readFile(path.join(root,'public',file));res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:data);return;}
 if(req.method==='GET'&&url.pathname==='/api/baccarat-stats'){await store.queue;const u=session(req,store.data);send(200,{rounds:u.baccaratHistory||[],limit:200});return;}
 if(req.method==='GET'&&url.pathname==='/api/leaderboard'){await store.queue;const players=Object.values(store.data.users).map(({username,balance})=>({username,balance})).sort((a,b)=>b.balance-a.balance||a.username.localeCompare(b.username,'ru'));send(200,{totalPlayers:players.length,players:players.slice(0,50).map((player,i)=>({rank:i+1,...player}))});return;}
 if(req.method==='GET'&&url.pathname==='/api/slot-math'){send(200,SLOT_MATH);return;}
 if(req.method==='GET'&&url.pathname==='/api/me'){await store.queue;send(200,snapshot(session(req,store.data)));return;}
 if(req.method!=='POST')throw fail(405,'Method not allowed');
 const origin=req.headers.origin;if(origin){let host;try{host=new URL(origin).host;}catch{throw fail(403,'Invalid origin');}if(host!==req.headers.host)throw fail(403,'Cross-origin request rejected');}if(req.headers['sec-fetch-site']==='cross-site')throw fail(403,'Cross-site request rejected');
 if(!(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'Expected JSON');let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>32768)throw fail(413,'Request too large');}let b;try{b=JSON.parse(body||'{}');}catch{throw fail(400,'Invalid JSON');}if(!b||typeof b!=='object'||Array.isArray(b))throw fail(400,'Invalid body');
 if(['/api/register','/api/login'].includes(url.pathname)){
 rate(req);const username=typeof b.username==='string'?b.username.trim():'';if(!/^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,24}$/.test(username)||typeof b.password!=='string'||b.password.length<8||b.password.length>128)throw fail(400,'Имя: 3–24 буквы/цифры; пароль: 8–128 символов.');
 const key=username.toLowerCase();let passwordHash,salt;if(url.pathname==='/api/register'){salt=randomBytes(16).toString('hex');passwordHash=Buffer.from(await scrypt(b.password,salt,64)).toString('hex');}
 else{await store.queue;const u=store.data.users[key];const actual=await scrypt(b.password,u?.salt||'no-account-constant-salt',64);if(!u||!timingSafeEqual(actual,Buffer.from(u.passwordHash,'hex')))throw fail(401,'Неверное имя или пароль');}
 const token=randomBytes(32).toString('hex');const result=await store.transaction(d=>{if(url.pathname==='/api/register'){if(d.users[key])throw fail(409,'Имя занято');d.users[key]={username,salt,passwordHash,balance:50000,version:0,game:null,history:[],requests:{},lastTopup:0};}for(const [k,s] of Object.entries(d.sessions))if(s.expires<Date.now())delete d.sessions[k];d.sessions[hash(token)]={user:key,expires:Date.now()+7*86400000};return snapshot(d.users[key]);});res.setHeader('Set-Cookie',`arcade_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure?'; Secure':''}`);send(200,result);return;
 }
 if(url.pathname==='/api/logout'){await store.transaction(d=>{const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('arcade_session='))?.slice(15);if(raw)delete d.sessions[hash(raw)];});res.setHeader('Set-Cookie','arcade_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(secure?'; Secure':''));send(200,{ok:true});return;}
 if(!['/api/topup','/api/game/start','/api/game/action'].includes(url.pathname))throw fail(404,'Not found');
 const result=await store.transaction(d=>{const u=session(req,d);if(typeof b.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(b.requestId))throw fail(400,'Нужен requestId');const fingerprint=hash(JSON.stringify({path:url.pathname,...b}));if(u.requests[b.requestId]){if(u.requests[b.requestId].fingerprint!==fingerprint)throw fail(409,'requestId уже использован');return snapshot(u);}if(b.version!==u.version)throw fail(409,'Состояние изменилось. Обновите данные.');
 let outcome;if(url.pathname==='/api/topup'){if(u.balance>5000||Date.now()-u.lastTopup<86400000||u.game&&!u.game.done)throw fail(400,'Пополнение: 10 000 монет раз в 24 часа, баланс не выше 5 000, без активной игры.');u.balance+=10000;u.lastTopup=Date.now();}
 else{if(url.pathname==='/api/game/start'){if(u.game&&!u.game.done)throw fail(409,'Завершите текущую игру');if(!cardTypes.has(b.type)&&!chanceTypes.has(b.type))throw fail(400,'Неизвестная игра');if(!Number.isSafeInteger(b.bet)||b.bet<(b.type==='roulette'?1:10)||b.bet>(b.type==='roulette'?1000000:100000)||(b.type!=='roulette'&&b.bet%10))throw fail(400,'Ставка: 10–100 000, кратно 10; рулетка: целые монеты с лимитами позиций');outcome=(cardTypes.has(b.type)?startCardGame:startChanceGame)(b.type,b.bet,b.options||{});}else{if(!u.game||u.game.done)throw fail(409,'Нет активной игры');outcome=(cardTypes.has(u.game.type)?actCardGame:actChanceGame)(structuredClone(u.game),b.action,b.options||{});}
 const cost=outcome.cost||0,payout=outcome.payout||0;if(!Number.isSafeInteger(cost)||cost<0||!Number.isSafeInteger(payout)||payout<0)throw Error('Engine returned invalid coins');if(cost>u.balance)throw fail(400,'Недостаточно монет');u.balance=u.balance-cost+payout;const previous=url.pathname==='/api/game/start'?null:u.game;u.game=outcome.state;u.game.done=!!outcome.done;u.game.totalCost=(previous?.totalCost||0)+cost;u.game.totalPayout=(previous?.totalPayout||0)+payout;
 if(outcome.done){if(u.game.type==='baccarat'){u.baccaratHistory??=[];u.baccaratHistory.push({id:b.requestId,time:new Date().toISOString(),outcome:u.game.outcome,playerPair:u.game.playerPair,bankerPair:u.game.bankerPair,playerTotal:u.game.playerTotal,bankerTotal:u.game.dealerTotal});u.baccaratHistory=u.baccaratHistory.slice(-200);}u.history.push({id:b.requestId,type:u.game.type,time:new Date().toISOString(),cost:u.game.totalCost,payout:u.game.totalPayout,net:u.game.totalPayout-u.game.totalCost});u.history=u.history.slice(-500);}}
 u.version++;u.requests[b.requestId]={fingerprint};const keys=Object.keys(u.requests);if(keys.length>500)delete u.requests[keys[0]];return snapshot(u);});send(200,result);
 }catch(e){if(!e.status&&!(e instanceof TypeError))console.error(e.message);send(e.status||400,{error:e.status&&e.status>=500?'Ошибка сервера':e.message||'Ошибка запроса'});}});
 server.on('close',()=>{store.close().catch(e=>console.error(e.message));});
 return {server,store};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {server}=await createApp();const port=Number(process.env.PORT||3000);server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`ЛУДКА.COM listening on port ${port}`));}
