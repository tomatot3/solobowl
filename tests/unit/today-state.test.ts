import "fake-indexeddb/auto";
import {describe,it,expect} from "vitest";
import {LocalStore} from "../../src/client/storage/database";
import {owner} from "../../src/domain/shared/validation";
import {readToday,saveToday,deleteToday} from "../../src/client/storage/today-state";
import {createClock} from "../../src/domain/calendar/clock";
describe("today-only local text",()=>{
 it("clears yesterday at Beijing midnight and refuses stale-day saves",async()=>{
  const store=new LocalStore(owner("guest","9987bc94-54ed-48f1-b332-cc4680020626"));let now=new Date("2026-12-31T15:59:00Z");const clock=createClock(()=>now);
  try{await saveToday(store,"2026-12-31","私密原文",0,clock);expect((await readToday(store,clock))?.text).toBe("私密原文");
   now=new Date("2026-12-31T16:00:00Z");expect(await readToday(store,clock)).toBeNull();expect(await store.get("today_state","current")).toBeUndefined();
   await expect(saveToday(store,"2026-12-31","旧日回传",0,clock)).rejects.toThrow("EXPIRED_STATE");
  }finally{await store.destroy();}
 });
 it("checks revision and deletes the raw value",async()=>{
  const store=new LocalStore(owner("guest","9987bc94-54ed-48f1-b332-cc4680020627"));const clock=createClock(()=>new Date("2026-11-24T00:00:00Z"));
  try{await saveToday(store,"2026-11-24","one",0,clock);await expect(saveToday(store,"2026-11-24","two",0,clock)).rejects.toThrow("REVISION_CONFLICT");await deleteToday(store,1,clock);expect(await readToday(store,clock)).toBeNull();}finally{await store.destroy();}
 });
});
