import {describe,it,expect} from "vitest";
import {calendarFixtures} from "../fixtures/calendar";
import {resolveSeasonContext} from "../../src/domain/calendar/context";
const periods=[...calendarFixtures,{...calendarFixtures[0]!,id:calendarFixtures[0]!.id,termCode:"lichun",season:"spring" as const,startDate:"2027-02-04",endDate:"2027-02-19"}];
describe("winter calendar boundaries",()=>{
 it("uses Beijing midnight and half-open boundaries for all six terms",()=>{
  for(const period of calendarFixtures){
   const start=new Date(`${period.startDate}T00:00:00+08:00`);
   expect(resolveSeasonContext(start,periods).currentTerm).toBe(period.termCode);
   expect(resolveSeasonContext(start,periods).scope).toBe("winter_open");
   expect(resolveSeasonContext(new Date(`${period.endDate}T00:00:00+08:00`),[period]).scope).toBe("calendar_unavailable");
  }
 });
 it("closes at the next lichun without hiding the winter library",()=>{
  const result=resolveSeasonContext(new Date("2027-02-03T16:00:00Z"),periods);
  expect(result.scope).toBe("scope_closed");expect(result.winterLibraryAvailable).toBe(true);
  expect(resolveSeasonContext(new Date("2027-02-03T15:59:59Z"),periods).scope).toBe("winter_open");
 });
 it("does not guess a term or Hou when metadata is absent or overlaps",()=>{
  expect(resolveSeasonContext(new Date("2026-11-24T00:00:00Z"),[]).scope).toBe("calendar_unavailable");
  expect(resolveSeasonContext(new Date("2026-11-24T00:00:00Z"),[...periods,periods[7]!]).scope).toBe("calendar_unavailable");
  expect(resolveSeasonContext(new Date("2026-11-24T00:00:00Z"),periods).houContent).toBeUndefined();
 });
 it("only returns approved Hou inside its actual reviewed interval",()=>{
  const period=calendarFixtures[7]!;const hou={id:period.id,periodId:period.id,startDate:"2026-11-22",endDate:"2026-11-25",name:"TEST",text:"TEST",sourceRef:"TEST",reviewRef:"TEST",status:"approved" as const};
  expect(resolveSeasonContext(new Date("2026-11-24T00:00:00Z"),periods,[hou]).houContent?.name).toBe("TEST");
  expect(resolveSeasonContext(new Date("2026-11-25T00:00:00Z"),periods,[hou]).houContent).toBeUndefined();
  expect(resolveSeasonContext(new Date("2026-11-24T00:00:00Z"),periods,[{...hou,status:"pending"}]).houContent).toBeUndefined();
 });
});
