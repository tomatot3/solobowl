import {describe,it,expect} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {createTodayStateService} from "../../src/server/profile/today-state";
import {createClock} from "../../src/domain/calendar/clock";
import {accountId} from "../../src/domain/shared/validation";
import {randomUUID} from "node:crypto";
describe("account today text transactions",()=>{
 it("isolates accounts, rejects concurrent stale revisions, and clears old raw text",async()=>{
  const db=await isolatedSchema();try{
   await runMigrations(db.pool,await loadMigrations());const id=accountId(randomUUID()),other=accountId(randomUUID());
   for(const key of [id,other])await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,\'TEST\',$2,true)',[key,`${key}@example.invalid`]);
   let now=new Date("2026-12-31T15:59:00Z");const service=createTodayStateService(db.pool,createClock(()=>now));
   const raced=await Promise.allSettled([service.save(id,"2026-12-31","PRIVATE_ONE",0),service.save(id,"2026-12-31","PRIVATE_TWO",0)]);expect(raced.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(await service.read(other)).toBeNull();expect((await service.read(id))?.revision).toBe(1);
   now=new Date("2026-12-31T16:00:00Z");expect(await service.read(id)).toBeNull();expect((await db.pool.query("SELECT count(*)::int count FROM today_state")).rows[0].count).toBe(0);
   await expect(service.save(id,"2026-12-31","OLD_UPLOAD",0)).rejects.toMatchObject({code:"EXPIRED_STATE"});
   await service.save(id,"2027-01-01","CURRENT",0);await service.remove(id,1);expect(await service.read(id)).toBeNull();
  }finally{await db.close();}
 });
});
