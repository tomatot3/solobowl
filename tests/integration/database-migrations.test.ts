import {describe,it,expect} from "vitest";
import {getMigrations} from "better-auth/db/migration";
import {identitySchemaOptions} from "../../src/server/auth/schema-options";
import {randomUUID} from "node:crypto";
import {isolatedSchema} from "../support/isolated-schema";
import {withTransaction} from "../../src/server/db/pool";
import {makeMigration,runMigrations,loadMigrations} from "../../src/server/db/migrate";
describe("transactional migrations on isolated real PostgreSQL schemas",()=>{
 it("commits on success and rolls back failed work on the same connection",async()=>{
  const db=await isolatedSchema();try{
   await db.pool.query("CREATE TABLE probe(value integer)");
   await withTransaction(db.pool,async client=>{await client.query("INSERT INTO probe VALUES(1)");});
   await expect(withTransaction(db.pool,async client=>{await client.query("INSERT INTO probe VALUES(2)");throw new Error("planned failure");})).rejects.toThrow("planned failure");
   expect((await db.pool.query("SELECT value FROM probe ORDER BY value")).rows).toEqual([{value:1}]);
  }finally{await db.close();}
 });
 it("applies a migration once even when two runners race",async()=>{
  const db=await isolatedSchema();try{
   const migrations=[makeMigration("001_probe.sql","CREATE TABLE probe(value integer); INSERT INTO probe VALUES(1);")];
   const results=await Promise.all([runMigrations(db.pool,migrations),runMigrations(db.pool,migrations)]);
   expect(results.reduce((n,r)=>n+r.applied.length,0)).toBe(1);
   expect((await db.pool.query("SELECT count(*)::int AS count FROM probe")).rows[0].count).toBe(1);
   expect((await db.pool.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count).toBe(1);
  }finally{await db.close();}
 });
 it("rejects changed applied SQL rather than silently rewriting history",async()=>{
  const db=await isolatedSchema();try{
   await runMigrations(db.pool,[makeMigration("001_probe.sql","CREATE TABLE probe(value integer)")]);
   await expect(runMigrations(db.pool,[makeMigration("001_probe.sql","CREATE TABLE other(value integer)")])).rejects.toMatchObject({code:"APPLIED_MIGRATION_CHANGED"});
   expect((await db.pool.query("SELECT to_regclass('other') AS table_name")).rows[0].table_name).toBeNull();
  }finally{await db.close();}
 });
 it("rolls back the whole pending batch when SQL fails",async()=>{
  const db=await isolatedSchema();try{
   await expect(runMigrations(db.pool,[makeMigration("001_probe.sql","CREATE TABLE probe(value integer)"),makeMigration("002_fail.sql","THIS IS NOT VALID SQL")])).rejects.toMatchObject({code:"MIGRATION_FAILED"});
   expect((await db.pool.query("SELECT to_regclass('probe') AS table_name")).rows[0].table_name).toBeNull();
  }finally{await db.close();}
 });
 it("matches locked Better Auth UUID schema and keeps account identity after email changes",async()=>{
  const db=await isolatedSchema();try{
   await runMigrations(db.pool,await loadMigrations());
   const plan=await getMigrations({database:db.pool,...identitySchemaOptions});
   expect(plan.toBeCreated).toHaveLength(0);expect(plan.toBeAdded).toHaveLength(0);expect(plan.toBeAddedIndexes).toHaveLength(0);expect(plan.schemaProblems).toHaveLength(0);
   const id=randomUUID();
   await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,false)',[id,"Test user","identity-before@example.invalid"]);
   await db.pool.query('INSERT INTO account("userId","accountId","providerId","updatedAt") VALUES($1,$2,$3,now())',[id,id,"credential"]);
   await db.pool.query('UPDATE "user" SET email=$1 WHERE id=$2',["identity-after@example.invalid",id]);
   expect((await db.pool.query('SELECT "userId" FROM account WHERE "providerId"=$1',["credential"])).rows[0].userId).toBe(id);
   await expect(db.pool.query('INSERT INTO account("userId","accountId","providerId","updatedAt") VALUES($1,$2,$3,now())',[id,id,"credential"])).rejects.toMatchObject({code:"23505"});
   await expect(db.pool.query(`INSERT INTO session("userId",token,"expiresAt","updatedAt") VALUES($1,$2,now()+interval '1 hour',now())`,[randomUUID(),randomUUID()])).rejects.toMatchObject({code:"23503"});
  }finally{await db.close();}
 });
});
