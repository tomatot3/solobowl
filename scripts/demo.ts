import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createDatabasePool} from "../src/server/db/pool";
import {loadMigrations,runMigrations} from "../src/server/db/migrate";
import {validateTestDatabase} from "../tests/support/test-database";
import {seedTestFixtures} from "../tests/support/seed-fixtures";

async function main(){
  process.loadEnvFile(".env.local");
  const test=validateTestDatabase();
  const pool=createDatabasePool(test);
  try{
    await runMigrations(pool,await loadMigrations());
    await seedTestFixtures(pool);
  }finally{await pool.end();}
  await mkdir(".cache",{recursive:true});
  await writeFile(".cache/tsconfig.demo.json",JSON.stringify({extends:"../tsconfig.json",
    include:["../next-env.d.ts","../**/*.ts","../**/*.tsx","next-demo/dev/types/**/*.ts"],
    exclude:["../node_modules","next-demo"]}));
  const child=spawn(process.execPath,[resolve("node_modules/next/dist/bin/next"),"dev","--webpack","--hostname","127.0.0.1","--port","3001"],{
    stdio:"inherit",
    env:{...process.env,DATABASE_URL:test,APP_BASE_URL:"http://localhost:3001",SHIYOUSHU_DEMO:"1",MAIL_TRANSPORT:"capture",AI_MODE:"disabled",NEXT_TELEMETRY_DISABLED:"1"},
  });
  child.on("exit",code=>{process.exitCode=code??1;});
}
main().catch(()=>{console.error("Demo startup failed. Use the isolated local test database.");process.exitCode=1;});
