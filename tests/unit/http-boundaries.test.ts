import {describe,it,expect} from "vitest";
import {accountId,owner} from "../../src/domain/shared/validation";
import {ApiError,createMeta,handleApi,parsePagination} from "../../src/server/http/envelope";
import {requireAccountSession,assertResourceOwner,assertSafeWrite,assertJsonMutation} from "../../src/server/http/access";
const id=accountId("8cf0bc94-54ed-48f1-b332-cc4680020626"),other="6b2883b6-01a7-47bd-b561-28748df460bb";
const now=new Date("2026-11-24T00:00:00Z");
describe("HTTP public contract and trusted ownership",()=>{
 it("wraps successful data with server-generated metadata and no-store",async()=>{
  const result=await handleApi(async()=>({ok:true}),createMeta(now));const body=await result.json();
  expect(body.data).toEqual({ok:true});expect(body.meta.serverTime).toBe(now.toISOString());expect(body.meta.requestId).toMatch(/^[a-f0-9-]{36}$/);expect(result.headers.get("cache-control")).toBe("no-store");
 });
 it("does not disclose raw internal errors, SQL, credentials or stack traces",async()=>{
  const response=await handleApi(async()=>{throw new Error("password=private; SELECT personal_information");},createMeta(now));
  expect(response.status).toBe(500);const text=await response.text();expect(text).not.toContain("private");expect(text).not.toContain("SELECT");expect(text).not.toContain("stack");
 });
 it("maps known errors without exposing the input value",async()=>{
  const result=await handleApi(async()=>{throw new ApiError("INVALID_INPUT",[{field:"limit",code:"invalid"}]);});
  expect(result.status).toBe(422);expect((await result.json()).error.fieldErrors).toEqual([{field:"limit",code:"invalid"}]);
 });
 it("ignores a forged client owner header",async()=>{
  const request=new Request("http://localhost/tasks",{headers:{"x-user-id":id}});
  await expect(requireAccountSession(request,async()=>null,now)).rejects.toMatchObject({code:"AUTH_REQUIRED"});
 });
 it("rejects expired and unverified sessions",async()=>{
  const request=new Request("http://localhost/tasks");
  await expect(requireAccountSession(request,async()=>({accountId:id,emailVerified:true,expiresAt:now}),now)).rejects.toMatchObject({code:"AUTH_REQUIRED"});
  await expect(requireAccountSession(request,async()=>({accountId:id,emailVerified:false,expiresAt:new Date(now.getTime()+1000)}),now)).rejects.toMatchObject({code:"EMAIL_VERIFICATION_REQUIRED"});
 });
 it("uses only a valid trusted session and hides foreign/guest/nonexistent resources",async()=>{
  const current=await requireAccountSession(new Request("http://localhost/tasks"),async()=>({accountId:id,emailVerified:true,expiresAt:new Date(now.getTime()+1000)}),now);
  expect(current).toEqual({kind:"account",id});expect(()=>assertResourceOwner(current,owner("account",id))).not.toThrow();
  for(const resource of [owner("account",other),owner("guest",id),null])expect(()=>assertResourceOwner(current,resource)).toThrow(ApiError);
 });
 it("rejects missing, foreign and cross-site origins for cookie-backed writes",()=>{
  const rejectedHeaders:Record<string,string>[]=[{},{origin:"http://other.invalid"},{origin:"http://localhost:3000","sec-fetch-site":"cross-site"}];
  for(const headers of rejectedHeaders){
   expect(()=>assertSafeWrite(new Request("http://localhost:3000/tasks",{method:"POST",headers}),"http://localhost:3000")).toThrow(ApiError);
  }
  expect(()=>assertSafeWrite(new Request("http://localhost:3000/tasks",{method:"POST",headers:{origin:"http://localhost:3000"}}),"http://localhost:3000")).not.toThrow();
 });
 it("requires JSON on body-bearing mutation requests",()=>{
  expect(()=>assertJsonMutation(new Request("http://localhost",{method:"POST",headers:{"content-type":"text/plain"}}))).toThrow(ApiError);
  expect(()=>assertJsonMutation(new Request("http://localhost",{method:"POST",headers:{"content-type":"application/json; charset=utf-8"}}))).not.toThrow();
 });
 it("enforces pagination limits, opaque cursors and duplicate-parameter rejection",()=>{
  expect(parsePagination(new URLSearchParams())).toEqual({limit:20});
  expect(parsePagination(new URLSearchParams("limit=50&cursor=opaque_123"))).toEqual({limit:50,cursor:"opaque_123"});
  for(const q of ["limit=0","limit=51","limit=-1","limit=1.5","limit=1&limit=2","cursor=a&cursor=b","cursor=%3Cscript%3E"]){expect(()=>parsePagination(new URLSearchParams(q))).toThrow(ApiError);}
 });
});
