import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import type {Workbook} from "../../src/domain/content/normalize";
import {createDatabasePool} from "../../src/server/db/pool";
import {saveStagedContent,stageContent} from "../../src/server/content/staging";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";

async function main(){
  const [path,write]=process.argv.slice(2);
  if(!path||(write!==undefined&&write!=="--stage"))throw new Error("Use: tsx scripts/content/import.ts workbook.xlsx [--stage]");
  const python=process.env.SHIYOUSHU_PYTHON??"python";
  const child=spawnSync(python,["-X","utf8",resolve("scripts/content/read_workbook.py"),resolve(path)],{encoding:"utf8",maxBuffer:16*1024*1024});
  if(child.error||child.status!==0)throw new Error("WORKBOOK_READ_FAILED");
  const source=JSON.parse(child.stdout) as Workbook;
  const result=stageContent(source);
  if(write==="--stage"){
    process.loadEnvFile(".env.local");
    const url=process.env.DATABASE_URL;
    if(!url||process.env.NODE_ENV==="production")throw new Error("LOCAL_DEVELOPMENT_DATABASE_REQUIRED");
    const target=new URL(url);
    if(!["localhost","127.0.0.1","[::1]"].includes(target.hostname)||!decodeURIComponent(target.pathname).endsWith("_dev"))throw new Error("LOCAL_DEVELOPMENT_DATABASE_REQUIRED");
    const pool=createDatabasePool(url);
    try{
      await runMigrations(pool,await loadMigrations());
      await saveStagedContent(pool,source,result);
    }finally{await pool.end();}
  }
  console.log(JSON.stringify(result.report,null,2));
}
main().catch(error=>{const code=error instanceof Error?error.message:"IMPORT_FAILED";console.error(/^[A-Za-z0-9_:! .\u4e00-\u9fa5-]{1,150}$/.test(code)?code:"IMPORT_FAILED");process.exitCode=1;});
