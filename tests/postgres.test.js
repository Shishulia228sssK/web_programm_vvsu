import test from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {PostgresStore} from '../lib/postgres-store.js';
import {createApp} from '../server.js';

test('PostgreSQL persists accounts and serializes overlapping servers, rollback and retries',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const databaseUrl=process.env.TEST_DATABASE_URL;
 const a=await createApp({databaseUrl,secure:false}),b=await createApp({databaseUrl,secure:false});
 const stores=[a.store,b.store];
 try{
  await a.store.transaction(d=>{d.users={};d.sessions={};});
  for(const app of [a,b])await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const urls=[a,b].map(app=>'http://127.0.0.1:'+app.server.address().port);
  const send=async(index,route,body,cookie)=>{const response=await fetch(urls[index]+route,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const registration=await send(0,'/api/register',{username:'pg_player',password:'postgres-test-password'});assert.equal(registration.status,200);
  const cookie=registration.cookie;assert.equal((await send(1,'/api/me',null,cookie)).body.user.balance,50000);
  const request={type:'dice',bet:100,options:{threshold:50,direction:'under'},version:registration.body.version,requestId:'postgres-request-001'};
  const results=await Promise.all([send(0,'/api/game/start',request,cookie),send(1,'/api/game/start',request,cookie)]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(results[0].body.user.balance,results[1].body.user.balance);
  const me=(await send(1,'/api/me',null,cookie)).body;assert.equal(me.history.length,1);
  await assert.rejects(a.store.transaction(d=>{d.users.pg_player.balance=1;throw Error('Rejected action');}),/Rejected action/);
  await b.store.refresh();assert.equal(b.store.data.users.pg_player.balance,me.user.balance);
  await assert.rejects(a.store.transaction(d=>{d.users.pg_player.balance=-1;}));
  await b.store.refresh();assert.equal(b.store.data.users.pg_player.balance,me.user.balance);
  await Promise.all(Array.from({length:20},(_,i)=>stores[i%2].transaction(d=>{d.users.pg_player.balance++;})));await a.store.refresh();assert.equal(a.store.data.users.pg_player.balance,me.user.balance+20);
  const reopened=new PostgresStore(databaseUrl);try{await reopened.init();assert.equal(reopened.data.users.pg_player.balance,me.user.balance+20);assert.equal(reopened.data.users.pg_player.history.length,1);}finally{await reopened.close();}
  const dir=await mkdtemp(path.join(tmpdir(),'ludka-pg-import-'));
  try{const file=path.join(dir,'arcade.json');await writeFile(file,JSON.stringify(a.store.data));const run=()=>promisify(execFile)(process.execPath,['scripts/import-postgres.mjs',file],{env:{...process.env,DATABASE_URL:databaseUrl}});await assert.rejects(run(),'Import must refuse existing accounts');await a.store.transaction(d=>{d.users={};d.sessions={};});await run();await b.store.refresh();assert.equal(b.store.data.users.pg_player.balance,me.user.balance+20);assert.equal(b.store.data.users.pg_player.history.length,1);}finally{await rm(dir,{recursive:true,force:true});}
 }finally{for(const app of [a,b]){if(app.server.listening)await new Promise(r=>app.server.close(r));await app.store.close();}}
});
