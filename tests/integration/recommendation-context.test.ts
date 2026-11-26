import {describe,it,expect,vi} from "vitest";
import {createServer} from "node:http";
import {randomUUID} from "node:crypto";
import {once} from "node:events";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {seedTestFixtures} from "../support/seed-fixtures";
import {createRecipeRepository} from "../../src/server/recipes/repository";
import {readSeasonContext} from "../../src/server/calendar/repository";
import {createRecommendationHandler,resolvePreAuthAccess} from "../../src/server/recommendations/service";
import {createClock} from "../../src/domain/calendar/clock";
import {genericContext} from "../../src/server/recipes/availability";
import {accountId} from "../../src/domain/shared/validation";
import {aiNoticeVersion,setAiConsent} from "../../src/server/profile/ai-consent";
import {accountRecommendationContext} from "../../src/server/recommendations/account-settings";
describe("real HTTP guest requests against isolated database",()=>{
 it("filters transient safety input without persisting it and refuses forged owner",async()=>{
  const db=await isolatedSchema();const server=createServer();const captured:unknown[][]=[];const log=vi.spyOn(console,"log").mockImplementation((...args)=>{captured.push(args);});const errorLog=vi.spyOn(console,"error").mockImplementation((...args)=>{captured.push(args);});try{
   await runMigrations(db.pool,await loadMigrations());await seedTestFixtures(db.pool);
   const handler=createRecommendationHandler({clock:createClock(()=>new Date("2026-11-24T00:00:00Z")),baseUrl:"http://localhost",content:createRecipeRepository(db.pool),season:now=>readSeasonContext(db.pool,now),resolveAccess:resolvePreAuthAccess});
   server.on("request",async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const response=await handler(new Request("http://localhost/api/v1/recommendations",{method:"POST",headers:{origin:String(req.headers.origin??""),"content-type":"application/json"},body:Buffer.concat(chunks).toString()}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}catch{res.writeHead(500);res.end();}});
   server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_SERVER_FAILED");
   const url=`http://127.0.0.1:${address.port}`;const post=(body:unknown)=>fetch(url,{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(body)});
   const snapshot=async()=>{const tables=(await db.pool.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",[db.schema])).rows;const rows=[];for(const {tablename} of tables){if(!/^[a-z_]+$/.test(tablename))throw new Error("UNSAFE_TEST_TABLE");rows.push([tablename,(await db.pool.query(`SELECT to_jsonb(t) value FROM "${tablename}" t ORDER BY to_jsonb(t)::text`)).rows]);}return JSON.stringify(rows);};
   const before=await snapshot();const marker="SENSITIVE_TEST_ONLY_9e826";
   const response=await post({guestContext:{safety:{consent:true,allergenIds:[marker]}}});expect(response.status).toBe(200);const result=await response.json();expect(result.data.results).toHaveLength(3);expect(JSON.stringify(result)).not.toContain(marker);
   expect((await post({guestContext:{safety:{consent:true,avoidedIngredientIds:["test-ingredient"]}}})).status).toBe(200);
   expect((await (await post({guestContext:{safety:{consent:true,avoidedIngredientIds:["test-ingredient"]}}})).json()).data.status).toBe("no_candidates");
   expect((await post({userId:"forged-owner"})).status).toBe(422);expect((await post({guestContext:{safety:{allergenIds:[marker]}}})).status).toBe(422);
   expect((await (await post({mealRequest:{}})).json()).error.code).toBe("NEED_MEAL_CONDITION");
   const timed=(await (await post({mealRequest:{maxMinutes:15}})).json()).data;
   expect(timed.mode).toBe("C");expect(timed.results.every((item:{totalMinutes:string|null})=>item.totalMinutes==="15")).toBe(true);
   const excluded=timed.results[0].recipeId;
   const replacement=(await (await post({mealRequest:{maxMinutes:15},excludeRecipeId:excluded})).json()).data;
   expect(replacement.results.length).toBeGreaterThan(0);
   expect(replacement.results[0]).toMatchObject({role:"primary",totalMinutes:"15",image:null});
   expect(replacement.results.every((item:{recipeId:string})=>item.recipeId!==excluded)).toBe(true);
   expect(await snapshot()).toBe(before);expect(before).not.toContain(marker);expect(JSON.stringify(captured)).not.toContain(marker);
  }finally{log.mockRestore();errorLog.mockRestore();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();}
 });
 it("uses only server account safety and blocks unresolved conflicts",async()=>{
  const db=await isolatedSchema();try{
   await runMigrations(db.pool,await loadMigrations());await seedTestFixtures(db.pool);
   const deps={clock:createClock(()=>new Date("2026-11-24T00:00:00Z")),baseUrl:"http://localhost",content:createRecipeRepository(db.pool),season:(now:Date)=>readSeasonContext(db.pool,now)};
   const request=()=>new Request("http://localhost",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify({guestContext:{safety:{consent:true,allergenIds:[]}}})});
   const handler=createRecommendationHandler({...deps,resolveAccess:async()=>({kind:"account",context:{...genericContext,avoidedIngredientIds:["test-ingredient"]}})});
   expect((await (await handler(request())).json()).data.status).toBe("no_candidates");
   const conflict=createRecommendationHandler({...deps,resolveAccess:async()=>({kind:"account",context:{...genericContext,safetyConflict:true}})});expect((await conflict(request())).status).toBe(409);
  }finally{await db.close();}
 });
 it("persists model consent for one verified account and removes access when withdrawn",async()=>{
  const db=await isolatedSchema();
  vi.stubEnv("AI_PROVIDER","deepseek");
  try{
   await runMigrations(db.pool,await loadMigrations());
   const first=accountId(randomUUID()),second=accountId(randomUUID());
   for(const id of [first,second])await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[id,"TEST",id+"@example.invalid"]);
   const notice="https://example.invalid/ai-notice";
   await expect(setAiConsent(db.pool,first,null,true)).rejects.toMatchObject({code:"NOT_READY"});
   expect((await setAiConsent(db.pool,first,notice,true)).granted).toBe(true);
   expect((await setAiConsent(db.pool,first,notice,true)).granted).toBe(true);
   expect((await accountRecommendationContext(db.pool,first)).aiConsent).toBe(true);
   expect((await accountRecommendationContext(db.pool,second)).aiConsent).toBe(false);
   vi.stubEnv("AI_PROVIDER","openai");
   const openAiNotice=aiNoticeVersion("openai");
   expect((await accountRecommendationContext(db.pool,first)).aiConsent).toBe(false);
   expect((await setAiConsent(db.pool,first,notice,true,openAiNotice)).granted).toBe(true);
   expect((await accountRecommendationContext(db.pool,first)).aiConsent).toBe(true);
   expect((await setAiConsent(db.pool,first,null,false,openAiNotice)).granted).toBe(false);
   expect((await accountRecommendationContext(db.pool,first)).aiConsent).toBe(false);
   expect((await accountRecommendationContext(db.pool,first)).preferences).toBeUndefined();
  }finally{vi.unstubAllEnvs();await db.close();}
 });
});
