import {insertReviewedVersion} from "../../src/server/content/version-writer";
import type pg from "pg";
import {validateTestDatabase} from "./test-database";
import {withTransaction} from "../../src/server/db/pool";
import {seedRecipes} from "../fixtures/recipes";
import {calendarFixtures} from "../fixtures/calendar";
/** Never import into development/production application paths. No truncation. */
export async function seedTestFixtures(pool:pg.Pool,env:Readonly<Record<string,string|undefined>>=process.env):Promise<number>{
 const target=validateTestDatabase(env);const expected=decodeURIComponent(new URL(target).pathname.slice(1));
 return withTransaction(pool,async client=>{
  const actual=(await client.query("SELECT current_database() name,inet_server_port() port")).rows[0];
  if(actual.name!==expected||actual.port!==Number(new URL(target).port||5432))throw new Error("TEST_FIXTURE_TARGET_MISMATCH");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shiyoushu.test-fixtures',0))");let inserted=0;
  for(const f of seedRecipes()){
   const v=f.version;const existing=(await client.query("SELECT content_hash,sealed FROM recipe_version WHERE id=$1",[v.id])).rows[0];
   if(existing){if(existing.content_hash!==v.contentHash||!existing.sealed)throw new Error("TEST_FIXTURE_CONTENT_CHANGED");continue;}
   await client.query("INSERT INTO recipe(id,source_id) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",[f.recipe.id,f.recipe.sourceId]);
   await insertReviewedVersion(client,v);
   await client.query("INSERT INTO recipe_lifecycle(version_id,recipe_id,state,withdrawal_reason) VALUES($1,$2,$3,$4)",[v.id,v.recipeId,f.lifecycle.state,f.lifecycle.withdrawalReason]);
   if(f.lifecycle.state==="published")await client.query("UPDATE recipe SET current_published_version_id=$1 WHERE id=$2",[v.id,v.recipeId]);inserted++;
  }
  for(const p of calendarFixtures)await client.query("INSERT INTO calendar_period(id,calendar_version,term_code,season,start_date,end_date,source_ref,review_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING",[p.id,p.calendarVersion,p.termCode,p.season,p.startDate,p.endDate,p.sourceRef,p.reviewRef]);
  return inserted;
 });
}
