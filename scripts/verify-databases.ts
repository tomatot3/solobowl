import pg from "pg";
import {readConfig} from "../src/server/config";
import {validateTestDatabase} from "../tests/support/test-database";
process.loadEnvFile(".env.local");
async function verify(){
 const config=readConfig();
 if(!config.DATABASE_URL)throw new Error("DATABASE_URL is required");
 const testUrl=validateTestDatabase();
 const sources=[config.DATABASE_URL,testUrl];
 const labels=["development","test"];
 const results: Record<string,string>={};
 for(let i=0;i<sources.length;i++){
  const source=sources[i]!;const c=new pg.Client({connectionString:source,connectionTimeoutMillis:5000});await c.connect();
  try {
   const record=(await c.query("SELECT current_database() AS database,current_setting('server_version_num')::int AS version")).rows[0];
   if(record.version<180000||record.version>=190000)throw new Error("PostgreSQL18 is required");
   if(record.database!==decodeURIComponent(new URL(source).pathname.slice(1)))throw new Error("Unexpected database identity");
   if(i===1){await c.query("BEGIN");try{await c.query("CREATE TEMP TABLE shiyoushu_verify_probe(value integer)");await c.query("INSERT INTO shiyoushu_verify_probe VALUES(18)");if((await c.query("SELECT value FROM shiyoushu_verify_probe")).rows[0].value!==18)throw new Error("Test transaction failed");}finally{await c.query("ROLLBACK");}}
   results[labels[i]!]="connected";
  }finally{await c.end();}
 }
 for(let i=0;i<sources.length;i++){
  const source=new URL(sources[i]!);source.pathname=new URL(sources[1-i]!).pathname;
  const c=new pg.Client({connectionString:source.toString(),connectionTimeoutMillis:5000});let denied=false;
  try{await c.connect();}catch(error){if((error as {code?:string}).code!=="42501")throw error;denied=true;}finally{await c.end().catch(()=>{});}
  if(!denied)throw new Error("Cross-database access must be denied");
 }
 console.log(JSON.stringify({...results,serverMajor:18,crossDatabaseAccess:"denied both ways",testTransaction:"passed and rolled back"},null,2));
}
verify().catch(error=>{console.error("Database verification failed: "+((error as {code?:string}).code||error.message));process.exitCode=1;});
