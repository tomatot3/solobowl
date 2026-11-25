import {readConfig} from "../src/server/config";
import {createDatabasePool} from "../src/server/db/pool";
import {loadMigrations,runMigrations} from "../src/server/db/migrate";
import {validateTestDatabase} from "../tests/support/test-database";
process.loadEnvFile(".env.local");
async function migrate(){
 const args=process.argv.slice(2);const target=args.length===0?"development":args.length===2&&args[0]==="--target"?args[1]:undefined;
 if(target!=="development"&&target!=="test")throw new Error("Use db:migrate [--target development|test]");
 if(process.env.NODE_ENV==="production")throw new Error("Local migration command refuses production; deployment requires a separate reviewed process");
 const config=readConfig();const connection=target==="test"?validateTestDatabase():config.DATABASE_URL;
 if(!connection)throw new Error("DATABASE_URL is required");const url=new URL(connection);
 if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw new Error("Local migrations require an explicit loopback database");
 const name=decodeURIComponent(url.pathname.slice(1));if(target==="development"&&!/^[a-z][a-z0-9_]*_dev$/i.test(name))throw new Error("Development migration target must be a dedicated _dev database");
 if(target==="development"&&config.TEST_DATABASE_URL&&new URL(config.TEST_DATABASE_URL).pathname===url.pathname)throw new Error("Development and test targets must differ");
 const pool=createDatabasePool(connection);try{
  const actual=(await pool.query("SELECT current_database() AS name,current_setting('server_version_num')::int AS version")).rows[0];
  if(actual.name!==name||actual.version<180000||actual.version>=190000)throw new Error("Unexpected database identity or PostgreSQL major version");
  const files=await loadMigrations();console.log(JSON.stringify({target,database:name,migrations:files.map(m=>m.id),action:"apply-pending"}));
  console.log(JSON.stringify(await runMigrations(pool,files)));
 }finally{await pool.end();}
}
migrate().catch(error=>{console.error("Migration refused or failed: "+((error as {code?:string}).code||error.message));process.exitCode=1;});
