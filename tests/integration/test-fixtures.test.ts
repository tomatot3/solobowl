import {describe,expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {runMigrations,loadMigrations} from "../../src/server/db/migrate";
import {seedTestFixtures} from "../support/seed-fixtures";
describe("isolated reviewed fixtures",()=>{
 it("seeds known/unknown times and adjacent-year boundaries idempotently",async()=>{
  const db=await isolatedSchema();try{
   await runMigrations(db.pool,await loadMigrations());expect(await seedTestFixtures(db.pool)).toBe(7);expect(await seedTestFixtures(db.pool)).toBe(0);
   const counts=(await db.pool.query("SELECT count(*)::int count,count(*) FILTER(WHERE total_minutes IS NULL)::int unknown FROM recipe_version")).rows[0];expect(counts).toEqual({count:7,unknown:1});
   expect((await db.pool.query("SELECT count(*)::int count FROM recipe_lifecycle WHERE state='published'")).rows[0].count).toBe(4);
   expect((await db.pool.query("SELECT count(*)::int count FROM calendar_period")).rows[0].count).toBe(12);
  }finally{await db.close();}
 });
 it("refuses production and development targets before querying",async()=>{
  const db=await isolatedSchema();try{
   await expect(seedTestFixtures(db.pool,{...process.env,NODE_ENV:"production"})).rejects.toThrow("forbidden in production");
   await expect(seedTestFixtures(db.pool,{...process.env,TEST_DATABASE_URL:process.env.DATABASE_URL})).rejects.toThrow();
  }finally{await db.close();}
 });
});
