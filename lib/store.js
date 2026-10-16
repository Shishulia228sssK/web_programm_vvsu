import {mkdir,readFile,writeFile,rename,open,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
export class Store {
 constructor(dir){this.dir=dir;this.file=path.join(dir,'arcade.json');this.lock=path.join(dir,'writer.lock');this.queue=Promise.resolve();}
 async acquire(){try{const f=await open(this.lock,'wx',0o600);await f.writeFile(String(process.pid));await f.close();this.ownsLock=true;return;}catch(e){if(e.code!=='EEXIST')throw e;}
 const recovery=this.lock+'.recovery';try{await mkdir(recovery);}catch(e){if(e.code==='EEXIST')throw Error('Storage lock recovery in progress; retry startup.');throw e;}
 try{let pid;try{pid=Number(await readFile(this.lock,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(pid!==undefined){if(!Number.isSafeInteger(pid)||pid<1)throw Error('Invalid storage lock; inspect before removing.');try{process.kill(pid,0);throw Error('Storage already has a running writer.');}catch(err){if(err.code!=='ESRCH')throw err;}await unlink(this.lock);}
 const f=await open(this.lock,'wx',0o600);await f.writeFile(String(process.pid));await f.close();this.ownsLock=true;
 }finally{await rmdir(recovery);}}

 close(){if(!this.closing)this.closing=(async()=>{await this.queue;if(this.ownsLock){this.ownsLock=false;await unlink(this.lock).catch(e=>{if(e.code!=='ENOENT')throw e;});}})();return this.closing;}
 async init(){await mkdir(this.dir,{recursive:true,mode:0o700});await this.acquire();try{let raw;try{raw=await readFile(this.file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 if(raw!==undefined){try{this.data=JSON.parse(raw);this.validate(this.data);return;}catch{this.data=JSON.parse(await readFile(this.file+'.bak','utf8'));this.validate(this.data);await this.persist(this.data);return;}}
 try{this.data=JSON.parse(await readFile(this.file+'.bak','utf8'));this.validate(this.data);}catch(e){if(e.code!=='ENOENT')throw e;this.data={users:{},sessions:{}};}await this.persist(this.data);
 }catch(e){await this.close();throw e;}}
 validate(d){const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);if(!obj(d)||!obj(d.users)||!obj(d.sessions))throw Error('Invalid storage');for(const u of Object.values(d.users))if(!obj(u)||typeof u.username!=='string'||!Number.isSafeInteger(u.balance)||u.balance<0||!Number.isSafeInteger(u.version)||!Array.isArray(u.history)||!obj(u.requests)||typeof u.salt!=='string'||!/^([a-f0-9]{128})$/.test(u.passwordHash))throw Error('Invalid account storage');for(const s of Object.values(d.sessions))if(!obj(s)||typeof s.user!=='string'||!Number.isFinite(s.expires))throw Error('Invalid session storage');}
 async synced(file,payload){await writeFile(file,payload,{mode:0o600});const f=await open(file,'r');try{await f.sync();}finally{await f.close();}}
 async persist(data){const payload=JSON.stringify(data);await this.synced(this.file+'.tmp',payload);await rename(this.file+'.tmp',this.file);await this.synced(this.file+'.bak.tmp',payload);await rename(this.file+'.bak.tmp',this.file+'.bak');const dir=await open(this.dir,'r');try{await dir.sync();}finally{await dir.close();}}
 transaction(fn){const run=this.queue.then(async()=>{if(this.failure)throw Error('Storage unavailable; restart after checking disk.');const next=structuredClone(this.data);const result=await fn(next);try{await this.persist(next);}catch(e){this.failure=e;throw Error('Storage write failed; restart and retry the same requestId.');}this.data=next;return result;});this.queue=run.catch(()=>{});return run;}
}
