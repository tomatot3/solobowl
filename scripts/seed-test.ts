import {validateTestDatabase} from "../tests/support/test-database";
import {createDatabasePool} from "../src/server/db/pool";
import {runMigrations,loadMigrations} from "../src/server/db/migrate";
import {seedTestFixtures} from "../tests/support/seed-fixtures";
process.loadEnvFile(".env.local");
async function main(){
 const target=validateTestDatabase();const pool=createDatabasePool(target);
 try{await runMigrations(pool,await loadMigrations());console.log(JSON.stringify({target:"dedicated-test-only",inserted:await seedTestFixtures(pool),notice:"Synthetic fixtures; no real recipe published or reviewed"}));}finally{await pool.end();}
}
main().catch(()=>{console.error("Test fixture initialization refused or failed; credentials and content are not logged");process.exitCode=1;});
