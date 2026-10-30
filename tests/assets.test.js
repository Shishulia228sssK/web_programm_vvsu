import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';

test('every stylesheet referenced by the deployed HTML is served as CSS',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ludka-assets-'));
 const {server,store}=await createApp({dataDir:dir});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true})});
 const origin='http://127.0.0.1:'+server.address().port;
 const html=await (await fetch(origin)).text();
 const styles=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
 assert.ok(styles.length>=2,'Stylesheet links exist');
 for(const href of styles){
  const response=await fetch(new URL(href,origin));
  assert.equal(response.status,200,href+' must load');
  assert.match(response.headers.get('content-type'),/^text\/css/);
  assert.ok((await response.text()).length>0);
 }
 const css=await readFile(new URL('../public/scene.css',import.meta.url),'utf8');
 assert.ok(css.includes('.poster-roulette'),'The served stylesheet contains the redesign');
});
