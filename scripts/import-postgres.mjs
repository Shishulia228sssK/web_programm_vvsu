import {readFile} from 'node:fs/promises';
import {PostgresStore} from '../lib/postgres-store.js';

if(!process.env.DATABASE_URL||!process.argv[2]){console.error('Usage: set DATABASE_URL, then node scripts/import-postgres.mjs path/to/arcade.json');process.exitCode=1;}
else{
 const store=new PostgresStore(process.env.DATABASE_URL);
 try{const data=JSON.parse(await readFile(process.argv[2],'utf8'));store.validate(data);await store.init();await store.transaction(current=>{if(Object.keys(current.users).length||Object.keys(current.sessions).length)throw Error('Import refused: database is not empty.');current.users=data.users;current.sessions=data.sessions;});console.log('Import complete. Existing accounts, balances and games preserved.');}
 catch{console.error('Import failed. Check the input file, database connection and that the destination has no accounts.');process.exitCode=1;}
 finally{await store.close();}
}
