import {describe,expect,it} from "vitest";
import {createLogger,type LogRecord} from "../../src/server/observability/logger";
const ref="8cf0bc94-54ed-48f1-b332-cc4680020626";
describe("allowlisted structured logging",()=>{
 it("drops sensitive and unknown keys and rejects arbitrary messages in safe-looking fields",()=>{
  const records:LogRecord[]=[];const log=createLogger({write:r=>{records.push(r);}});
  log.write("recipe.excluded",{subjectRef:ref,reason:"safety_unknown",count:2,password:"secret",token:"secret",health:"过敏原文",today:"今日原文",prompt:"prompt",response:"response",requestId:"today text",durationMs:"password",status:500});
  expect(records).toEqual([{event:"recipe.excluded",subjectRef:ref,reason:"safety_unknown",count:2,status:500}]);
  log.write("http.request",{reason:"私密原文",count:NaN,durationMs:-1,status:999});
  expect(records[1]).toEqual({event:"http.request"});
 });
 it("rejects unrecognized event strings even when types are bypassed",()=>{
  const records:LogRecord[]=[];const log=createLogger({write:r=>{records.push(r);}});
  expect(()=>log.write("health text" as never,{})).toThrow("INVALID_LOG_EVENT");expect(records).toEqual([]);
 });
 it("supports an explicit purge adapter and fails visibly when unavailable",async()=>{
  const removed:string[]=[];const log=createLogger({write:()=>{},clearSubject:async r=>{removed.push(r);}});
  await log.clearSubject(ref);expect(removed).toEqual([ref]);
  await expect(log.clearSubject("raw personal value")).rejects.toThrow("INVALID_SUBJECT_REF");
  await expect(createLogger({write:()=>{}}).clearSubject(ref)).rejects.toThrow("LOG_PURGE_UNAVAILABLE");
 });
});
