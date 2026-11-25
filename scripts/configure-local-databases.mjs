import pg from "pg";
import {randomBytes} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const runtime=resolve(process.env.LOCALAPPDATA||"", "ShiyoushuDev/PostgreSQL18");
const host="127.0.0.1",port=55432;
const definitions=[{role:"shiyoushu_dev_app",database:"shiyoushu_dev"},{role:"shiyoushu_test_app",database:"shiyoushu_test"}];
function client(user,password,database){return new pg.Client({host,port,user,password,database,connectionTimeoutMillis:5000});}
async function main(){
 const envFile=resolve(root,".env.local");let localEnv="";try{localEnv=await readFile(envFile,"utf8");}catch{}
 if(/^\s*(DATABASE_URL|TEST_DATABASE_URL)=/m.test(localEnv))throw Error("Existing database configuration must not be overwritten");
 const bootstrapPassword=(await readFile(resolve(runtime,"bootstrap-password.txt"),"utf8")).trim();
 const admin=client("shiyoushu_bootstrap",bootstrapPassword,"postgres");await admin.connect();
 const credentialsFile=resolve(root,".cache/database-credentials.json");let credentials;
 try{credentials=JSON.parse(await readFile(credentialsFile,"utf8"));}catch{}
 try{
  const result=await admin.query("SELECT current_setting('data_directory') AS directory, current_setting('server_version_num')::int AS version");
  const actual=result.rows[0];if(actual.version<180000||actual.version>=190000||resolve(actual.directory).toLowerCase()!==resolve(runtime,"data").toLowerCase())throw Error("Unexpected PostgreSQL instance; refusing configuration");
  for(const d of definitions){
   const exists=await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[d.role]);
   if(exists.rowCount&&!credentials?.[d.role])throw Error("Existing role has no project credential record; refusing overwrite");
  }
  if(!credentials){credentials=Object.fromEntries(definitions.map(d=>[d.role,randomBytes(32).toString("hex")]));await mkdir(resolve(root,".cache"),{recursive:true});await writeFile(credentialsFile,JSON.stringify(credentials),{encoding:"utf8",mode:0o600});}
  for(const d of definitions){
   if(!/^[a-f0-9]{64}$/.test(credentials[d.role]||""))throw Error("Invalid local credential format");
   const exists=await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[d.role]);
   if(!exists.rowCount)await admin.query(`CREATE ROLE "${d.role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${credentials[d.role]}'`);
   const databases=await admin.query("SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",[d.database]);
   if(!databases.rowCount)await admin.query(`CREATE DATABASE "${d.database}" OWNER "${d.role}" ENCODING 'UTF8'`);
   else if(databases.rows[0].owner!==d.role)throw Error("Unexpected database owner; refusing modification");
   await admin.query(`REVOKE CONNECT,TEMPORARY ON DATABASE "${d.database}" FROM PUBLIC`);
   await admin.query(`GRANT CONNECT,TEMPORARY ON DATABASE "${d.database}" TO "${d.role}"`);
  }
 }finally{await admin.end();}
 for(const d of definitions){const c=client(d.role,credentials[d.role],d.database);await c.connect();try{
  const identity=(await c.query("SELECT current_database() AS database,current_user AS role")).rows[0];if(identity.database!==d.database||identity.role!==d.role)throw Error("Database identity mismatch");
  if(d.database==="shiyoushu_test"){await c.query("BEGIN");await c.query("CREATE TEMP TABLE bootstrap_isolation_probe (value text)");await c.query("INSERT INTO bootstrap_isolation_probe VALUES ('isolated-test')");const row=(await c.query("SELECT value FROM bootstrap_isolation_probe")).rows[0];if(row.value!=="isolated-test")throw Error("Test transaction failed");await c.query("ROLLBACK");}
 }finally{await c.end();}}
 for(let i=0;i<definitions.length;i++){const d=definitions[i],other=definitions[1-i];const c=client(d.role,credentials[d.role],other.database);let denied=false;try{await c.connect();}catch(e){if(e.code!=="42501")throw e;denied=true;}finally{await c.end().catch(()=>{});}if(!denied)throw Error("Cross-database connection was not denied");}
 const urls=definitions.map(d=>{const u=new URL(`postgresql://${host}:${port}/${d.database}`);u.username=d.role;u.password=credentials[d.role];return u.toString();});
 await writeFile(envFile,localEnv.trimEnd()+"\nDATABASE_URL="+urls[0]+"\nTEST_DATABASE_URL="+urls[1]+"\n",{encoding:"utf8",mode:0o600});
 console.log(JSON.stringify({postgresql:"18.7",development:"connected",test:"connected",crossDatabaseAccess:"denied",testTransaction:"passed",credentials:"written to ignored local files; not logged"},null,2));
}
main().catch(e=>{console.error("Local database configuration failed: "+(e.code||e.message));process.exitCode=1;});
