import {describe,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {accountId,owner} from "../../src/domain/shared/validation";
import {createClock} from "../../src/domain/calendar/clock";
import {PortUnavailableError} from "../../src/domain/shared/ports";
import {createAccountHandler,assertResourceOwner,type SessionResolver} from "../../src/server/http/access";
import {validateTestDatabase} from "../support/test-database";
const instant=new Date("2026-11-24T00:00:00Z"),clock=createClock(()=>instant);
describe("foundation contract; no business recommendation endpoint",()=>{
 it("resolves identity from a trusted session and reads only that test account",async()=>{
  const db=await isolatedSchema();try{
   await runMigrations(db.pool,await loadMigrations());const id=accountId(randomUUID()),other=accountId(randomUUID());
   await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true),($4,$5,$6,true)',[id,"TEST A",`${id}@example.invalid`,other,"TEST B",`${other}@example.invalid`]);
   const resolver:SessionResolver=async()=>({accountId:id,emailVerified:true,expiresAt:new Date(instant.getTime()+60000)});
   const handler=createAccountHandler({baseUrl:"http://localhost",resolveSession:resolver,clock},async context=>{
    const row=(await db.pool.query('SELECT id FROM "user" WHERE id=$1',[context.id])).rows[0];return {id:row.id};
   });
   const response=await handler(new Request(`http://localhost/probe?userId=${other}`,{headers:{"x-user-id":other}}));
   expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");const result=await response.json();expect(result.data).toEqual({id});expect(result.meta.serverTime).toBe(instant.toISOString());
   const foreign=createAccountHandler({baseUrl:"http://localhost",resolveSession:resolver,clock},async context=>{assertResourceOwner(context,owner("account",other));return {id:other};});
   expect((await foreign(new Request("http://localhost/probe"))).status).toBe(404);
  }finally{await db.close();}
 });
 it("returns wrapped 401/403/503 and does not invoke work after a failed boundary",async()=>{
  let calls=0;const work=async()=>{calls++;return {ok:true};};
  const anonymous=createAccountHandler({baseUrl:"http://localhost",resolveSession:async()=>null,clock},work);
  expect((await anonymous(new Request("http://localhost/probe"))).status).toBe(401);
  expect((await anonymous(new Request("http://localhost/probe",{method:"POST",headers:{origin:"http://other.invalid","content-type":"application/json"}}))).status).toBe(403);expect(calls).toBe(0);
  const unavailable=createAccountHandler({baseUrl:"http://localhost",resolveSession:async()=>({accountId:accountId(randomUUID()),emailVerified:true,expiresAt:new Date(instant.getTime()+60000)}),clock},async()=>{throw new PortUnavailableError();});
  const response=await unavailable(new Request("http://localhost/probe"));expect(response.status).toBe(503);expect((await response.json()).error.code).toBe("NOT_READY");
 });
 it("checks the dedicated test database and refuses a development identity",async()=>{
  const db=await isolatedSchema();try{
   const expected=decodeURIComponent(new URL(validateTestDatabase()).pathname.slice(1));expect((await db.pool.query("SELECT current_database() name")).rows[0].name).toBe(expected);
   expect(()=>validateTestDatabase({...process.env,TEST_DATABASE_URL:process.env.DATABASE_URL})).toThrow();
  }finally{await db.close();}
 });
});
