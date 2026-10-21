import pg from 'pg';
import {Store} from './store.js';

// One transactional snapshot preserves the existing game/version/requestId contract.
// Row locking also serializes writers during overlapping cloud deployments.
export class PostgresStore {
 constructor(connectionString){this.pool=new pg.Pool({connectionString,max:3,connectionTimeoutMillis:15000});this.queue=Promise.resolve();this.pool.on('error',()=>{});}
 validate(data){Store.prototype.validate(data);}
 enqueue(fn){const run=this.queue.then(fn);this.queue=run.catch(()=>{});return run;}
 async init(){try{await this.pool.query('CREATE TABLE IF NOT EXISTS ludka_state (id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL)');await this.pool.query('INSERT INTO ludka_state (id,data) VALUES (1,$1) ON CONFLICT (id) DO NOTHING',[JSON.stringify({users:{},sessions:{}})]);await this.refresh();}catch{await this.close();throw Error('PostgreSQL startup failed. Check DATABASE_URL, TLS and database availability.');}}
 refresh(){return this.enqueue(async()=>{try{const {rows}=await this.pool.query('SELECT data FROM ludka_state WHERE id=1');this.validate(rows[0]?.data);this.data=rows[0].data;}catch{throw Error('PostgreSQL unavailable; retry later.');}});}
 transaction(fn){return this.enqueue(async()=>{let client,begun=false,callbackError;try{client=await this.pool.connect();await client.query('BEGIN');begun=true;const {rows}=await client.query('SELECT data FROM ludka_state WHERE id=1 FOR UPDATE');const next=rows[0]?.data;this.validate(next);let result;try{result=await fn(next);}catch(error){callbackError=error;throw error;}this.validate(next);await client.query('UPDATE ludka_state SET data=$1 WHERE id=1',[JSON.stringify(next)]);await client.query('COMMIT');begun=false;this.data=next;return result;}catch(error){if(client&&begun)await client.query('ROLLBACK').catch(()=>{});if(callbackError)throw callbackError;throw Error('PostgreSQL transaction failed; retry the same requestId.');}finally{client?.release();}});}
 close(){if(!this.closing)this.closing=this.queue.then(()=>this.pool.end());return this.closing;}
}
