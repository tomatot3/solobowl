import {describe,it,expect} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {seedTestFixtures} from "../support/seed-fixtures";
import {createClock} from "../../src/domain/calendar/clock";
import {readSeasonContext} from "../../src/server/calendar/repository";
import {createSeasonHandler} from "../../src/server/calendar/handler";
describe("database-backed season endpoint handler",()=>{
 it("returns 503 for absent calendar and uses seeded metadata only after initialization",async()=>{
  const db=await isolatedSchema();try{
   await runMigrations(db.pool,await loadMigrations());const clock=createClock(()=>new Date("2026-11-24T00:00:00Z"));
   const handler=createSeasonHandler(clock,now=>readSeasonContext(db.pool,now));const request=new Request("http://localhost/api/v1/season-context");
   let response=await handler(request);expect(response.status).toBe(503);expect((await response.json()).error.code).toBe("CALENDAR_UNAVAILABLE");
   await seedTestFixtures(db.pool);response=await handler(request);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");const body=await response.json();expect(body.data).toMatchObject({currentTerm:"xiaoxue",scope:"winter_open",businessDate:"2026-11-24"});expect(body.data.houContent).toBeUndefined();
   expect((await handler(new Request("http://localhost/api/v1/season-context?date=2026-12-22"))).status).toBe(422);
  }finally{await db.close();}
 });
});
