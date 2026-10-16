import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {Store} from '../lib/store.js';

async function fixture(t){const dir=await mkdtemp('/tmp/arcade-security-');const store=new Store(dir);await store.init();t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});return {dir,store};}

test('storage excludes a second live writer and permits opening after close',async t=>{
 const {dir,store}=await fixture(t);
 await assert.rejects(new Store(dir).init(),/running writer/);
 await store.transaction(d=>{d.audit={balance:100};});
 await store.close();
 const reopened=new Store(dir);await reopened.init();
 assert.equal(reopened.data.audit.balance,100);
 await reopened.close();
});

test('post-rename backup failure blocks later writes and preserves committed primary for restart',async t=>{
 const {dir,store}=await fixture(t);
 await mkdir(store.file+'.bak.tmp');
 await assert.rejects(store.transaction(d=>{d.audit={balance:49000};}),/Storage write failed/);
 assert.equal(JSON.parse(await readFile(store.file,'utf8')).audit.balance,49000);
 await assert.rejects(store.transaction(d=>{d.other={balance:50000};}),/Storage unavailable/);
 assert.equal(JSON.parse(await readFile(store.file,'utf8')).audit.balance,49000);
 await rm(store.file+'.bak.tmp',{recursive:true});await store.close();
 const reopened=new Store(dir);await reopened.init();
 assert.equal(reopened.data.audit.balance,49000);
 await reopened.transaction(d=>{d.audit.balance-=100;});
 assert.equal(reopened.data.audit.balance,48900);await reopened.close();
});

test('simultaneous stale lock recovery grants only one writer',async t=>{
 const dir=await mkdtemp('/tmp/arcade-stale-');
 const {writeFile}=await import('node:fs/promises');
 await writeFile(dir+'/writer.lock','2147483647');
 const candidates=[new Store(dir),new Store(dir)];
 t.after(async()=>{await Promise.all(candidates.filter(s=>s.ownsLock).map(s=>s.close()));await rm(dir,{recursive:true,force:true});});
 const outcomes=await Promise.allSettled(candidates.map(s=>s.init()));
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);
});
