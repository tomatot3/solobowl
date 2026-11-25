import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {withTransaction} from "../../src/server/db/pool";
let db:Awaited<ReturnType<typeof isolatedSchema>>;
beforeEach(async()=>{db=await isolatedSchema();await runMigrations(db.pool,await loadMigrations());});
afterEach(async()=>{await db?.close();});
async function draft(recipeId=randomUUID(),revision=1){
 await db.pool.query("INSERT INTO recipe(id,source_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[recipeId,`fixture-${recipeId}`]);
 const versionId=randomUUID(),lineId=randomUUID(),stepId=randomUUID(),optionId=randomUUID();
 await db.pool.query("INSERT INTO recipe_version(id,recipe_id,internal_revision,raw_version,source_hash,content_hash,name,season,completeness,prep_minutes,cook_minutes) VALUES($1,$2,$3,'v0.1',$4,$4,'TEST ONLY','winter',1,5,10)",[versionId,recipeId,revision,"a".repeat(64)]);
 await db.pool.query("INSERT INTO recipe_lifecycle(version_id,recipe_id) VALUES($1,$2)",[versionId,recipeId]);
 await db.pool.query("INSERT INTO ingredient_line(id,version_id,ordinal,raw_name,role,amount_kind,quantity,unit) VALUES($1,$2,1,'TEST ONLY','main','numeric',100,'g')",[lineId,versionId]);
 await db.pool.query("INSERT INTO recipe_step(id,version_id,ordinal,instruction) VALUES($1,$2,1,'TEST ONLY')",[stepId,versionId]);
 await db.pool.query("INSERT INTO step_ingredient(version_id,step_id,line_id) VALUES($1,$2,$3)",[versionId,stepId,lineId]);
 await db.pool.query("INSERT INTO serving_option(id,version_id,servings) VALUES($1,$2,1)",[optionId,versionId]);
 await db.pool.query("INSERT INTO serving_quantity(version_id,option_id,line_id,quantity,unit) VALUES($1,$2,$3,100,'g')",[versionId,optionId,lineId]);
 return {recipeId,versionId,lineId,stepId,optionId};
}
async function review(f:Awaited<ReturnType<typeof draft>>){
 const evidence=randomUUID();await db.pool.query("INSERT INTO source_evidence(id,version_id,source_type,citation,source_hash) VALUES($1,$2,'adaptation','ISOLATED TEST FIXTURE - NOT REAL REVIEW',$3)",[evidence,f.versionId,"b".repeat(64)]);
 for(const scope of ["content","servings","steps","sources","dictionary","safety"]){
  const ref=randomUUID();await db.pool.query("INSERT INTO content_review(id,version_id,scope,status,reviewer,reviewed_at,evidence_id) VALUES($1,$2,$3,'approved','TEST ONLY',now(),$4)",[ref,f.versionId,scope,evidence]);
  if(scope==="servings")await db.pool.query("UPDATE serving_option SET review_ref=$1 WHERE id=$2",[ref,f.optionId]);
 }
}
async function publish(f:Awaited<ReturnType<typeof draft>>){
 await withTransaction(db.pool,async client=>{
  await client.query("UPDATE recipe_lifecycle SET state='published',revision=revision+1 WHERE version_id=$1",[f.versionId]);
  await client.query("UPDATE recipe SET current_published_version_id=$1 WHERE id=$2",[f.versionId,f.recipeId]);
 });
}
describe("recipe invariants on real PostgreSQL",()=>{
 it("keeps completeness separate from publication and unknown totals null",async()=>{
  const f=await draft();let row=(await db.pool.query("SELECT total_minutes,(SELECT state FROM recipe_lifecycle WHERE version_id=v.id) state FROM recipe_version v WHERE id=$1",[f.versionId])).rows[0];expect(row).toEqual({total_minutes:"15",state:"draft"});
  await db.pool.query("UPDATE recipe_version SET cook_minutes=NULL WHERE id=$1",[f.versionId]);row=(await db.pool.query("SELECT total_minutes FROM recipe_version WHERE id=$1",[f.versionId])).rows[0];expect(row.total_minutes).toBeNull();
 });
 it("rejects inconsistent quantities, duplicate order, wrong-version links and automatic multi-serving options",async()=>{
  const f=await draft(),other=await draft();
  await expect(db.pool.query("INSERT INTO ingredient_line(version_id,ordinal,raw_name,role,amount_kind,quantity,quantity_text) VALUES($1,2,'x','main','numeric',1,'适量')",[f.versionId])).rejects.toMatchObject({code:"23514"});
  await expect(db.pool.query("INSERT INTO recipe_step(version_id,ordinal,instruction) VALUES($1,1,'x')",[f.versionId])).rejects.toMatchObject({code:"23505"});
  await expect(db.pool.query("INSERT INTO step_ingredient(version_id,step_id,line_id) VALUES($1,$2,$3)",[f.versionId,f.stepId,other.lineId])).rejects.toMatchObject({code:"23503"});
  await expect(db.pool.query("INSERT INTO serving_option(version_id,servings) VALUES($1,2)",[f.versionId])).rejects.toMatchObject({code:"23514"});
  await expect(db.pool.query("UPDATE ingredient_line SET role='auxiliary_water' WHERE id=$1",[f.lineId])).rejects.toMatchObject({code:"23514"});
 });
 it("requires continuous steps and complete serving quantities before sealing",async()=>{
  const f=await draft();await db.pool.query("UPDATE recipe_step SET ordinal=2 WHERE id=$1",[f.stepId]);
  await expect(db.pool.query("UPDATE recipe_version SET sealed=true WHERE id=$1",[f.versionId])).rejects.toMatchObject({code:"23514"});
  await db.pool.query("UPDATE recipe_step SET ordinal=1 WHERE id=$1",[f.stepId]);await db.pool.query("DELETE FROM serving_quantity WHERE option_id=$1",[f.optionId]);
  await expect(db.pool.query("UPDATE recipe_version SET sealed=true WHERE id=$1",[f.versionId])).rejects.toMatchObject({code:"23514"});
 });
 it("freezes a sealed version and its children while lifecycle can change",async()=>{
  const f=await draft();await db.pool.query("UPDATE recipe_version SET sealed=true WHERE id=$1",[f.versionId]);
  for(const [sql,id] of [["UPDATE recipe_version SET name='changed' WHERE id=$1",f.versionId],["UPDATE ingredient_line SET quantity=200 WHERE id=$1",f.lineId],["DELETE FROM recipe_step WHERE id=$1",f.stepId],["UPDATE serving_option SET servings=2 WHERE id=$1",f.optionId]] as const)await expect(db.pool.query(sql,[id])).rejects.toMatchObject({code:"23514"});
  await db.pool.query("UPDATE recipe_lifecycle SET state='safety_withdrawn',revision=revision+1,withdrawal_reason='TEST NOTICE' WHERE version_id=$1",[f.versionId]);
  expect((await db.pool.query("SELECT name FROM recipe_version WHERE id=$1",[f.versionId])).rows[0].name).toBe("TEST ONLY");
  await expect(db.pool.query("UPDATE recipe_lifecycle SET state='draft' WHERE version_id=$1",[f.versionId])).rejects.toMatchObject({code:"23514"});
 });
 it("does not accept a draft or sealed-but-unreviewed current pointer",async()=>{
  const f=await draft();await expect(db.pool.query("UPDATE recipe SET current_published_version_id=$1 WHERE id=$2",[f.versionId,f.recipeId])).rejects.toMatchObject({code:"23514"});
  await db.pool.query("UPDATE recipe_version SET sealed=true WHERE id=$1",[f.versionId]);await expect(publish(f)).rejects.toMatchObject({code:"23514"});
  expect((await db.pool.query("SELECT state FROM recipe_lifecycle WHERE version_id=$1",[f.versionId])).rows[0].state).toBe("draft");
 });
 it("allows a reviewed fixture and switches current versions atomically",async()=>{
  const first=await draft();await review(first);await db.pool.query("UPDATE recipe_version SET sealed=true WHERE id=$1",[first.versionId]);await publish(first);
  const second=await draft(first.recipeId,2);await review(second);await db.pool.query("UPDATE recipe_version SET sealed=true WHERE id=$1",[second.versionId]);
  await expect(publish(second)).rejects.toMatchObject({code:"23505"});
  await withTransaction(db.pool,async client=>{
   await client.query("UPDATE recipe_lifecycle SET state='archived',revision=revision+1 WHERE version_id=$1",[first.versionId]);
   await client.query("UPDATE recipe_lifecycle SET state='published',revision=revision+1 WHERE version_id=$1",[second.versionId]);
   await client.query("UPDATE recipe SET current_published_version_id=$1 WHERE id=$2",[second.versionId,first.recipeId]);
  });
  expect((await db.pool.query("SELECT current_published_version_id FROM recipe WHERE id=$1",[first.recipeId])).rows[0].current_published_version_id).toBe(second.versionId);
  expect((await db.pool.query("SELECT count(*)::int count FROM recipe_version WHERE recipe_id=$1 AND sealed",[first.recipeId])).rows[0].count).toBe(2);
 });
 it("uses nonoverlapping half-open calendar ranges and contained winter Hou intervals",async()=>{
  const period=randomUUID();await db.pool.query("INSERT INTO calendar_period(id,calendar_version,term_code,season,start_date,end_date,source_ref,review_ref) VALUES($1,'TEST','dahan','winter','2027-01-20','2027-02-04','TEST','TEST')",[period]);
  await db.pool.query("INSERT INTO calendar_period(calendar_version,term_code,season,start_date,end_date,source_ref,review_ref) VALUES('TEST','lichun','spring','2027-02-04','2027-02-19','TEST','TEST')");
  await expect(db.pool.query("INSERT INTO calendar_period(calendar_version,term_code,season,start_date,end_date,source_ref,review_ref) VALUES('TEST','other','winter','2027-01-21','2027-01-23','TEST','TEST')")).rejects.toMatchObject({code:"23514"});
  await db.pool.query("INSERT INTO hou_content(period_id,start_date,end_date,name,text,source_ref,status) VALUES($1,'2027-01-20','2027-01-24','TEST','TEST','TEST','pending')",[period]);
  await expect(db.pool.query("INSERT INTO hou_content(period_id,start_date,end_date,name,text,source_ref,status) VALUES($1,'2027-02-03','2027-02-05','TEST','TEST','TEST','pending')",[period])).rejects.toMatchObject({code:"23514"});
  await expect(db.pool.query("UPDATE calendar_period SET start_date='2027-01-21' WHERE id=$1",[period])).rejects.toMatchObject({code:"23514"});
 });
 it("serializes overlapping concurrent calendar inserts",async()=>{
  const insert=(start:string,end:string)=>db.pool.query("INSERT INTO calendar_period(calendar_version,term_code,season,start_date,end_date,source_ref,review_ref) VALUES('RACE','TEST','winter',$1,$2,'TEST','TEST')",[start,end]);
  const results=await Promise.allSettled([insert("2026-12-01","2026-12-10"),insert("2026-12-05","2026-12-15")]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
 });
});
