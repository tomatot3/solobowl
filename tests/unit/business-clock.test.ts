import {describe,expect,it} from "vitest";
import {businessDate,createClock,systemClock,nextBusinessDate} from "../../src/domain/calendar/clock";
describe("server clock and Beijing business date",()=>{
 it("crosses year at Beijing midnight independently of UTC date",()=>{
  expect(businessDate(new Date("2026-12-31T15:59:59.999Z"))).toBe("2026-12-31");
  expect(businessDate(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  expect(businessDate(new Date("2026-11-24T00:30:00-08:00"))).toBe("2026-11-24");
 });
 it("handles leap days and rejects invalid dates rather than rolling them over",()=>{
  expect(nextBusinessDate("2028-02-28")).toBe("2028-02-29");expect(nextBusinessDate("2028-02-29")).toBe("2028-03-01");
  expect(nextBusinessDate("2026-12-31")).toBe("2027-01-01");
  expect(()=>nextBusinessDate("2026-02-29")).toThrow();expect(()=>businessDate(new Date(NaN))).toThrow();
 });
 it("injects a UTC clock as a dependency, with defensive copies",()=>{
  const date=new Date("2026-11-24T16:00:00Z");const clock=createClock(()=>date);
  clock.now().setUTCFullYear(2000);expect(clock.now().toISOString()).toBe("2026-11-24T16:00:00.000Z");
  expect(clock.businessDate()).toBe("2026-11-25");expect(Number.isFinite(systemClock.now().getTime())).toBe(true);
 });
});
