import type {CalendarPeriod} from "../../src/domain/recipes/types";
import {fixtureId} from "./recipes";
/** Synthetic boundary fixtures, not verified ephemerides or production content. */
export const calendarFixtures:readonly CalendarPeriod[]=[2025,2026].flatMap((year,i)=>{
 const dates=[`${year}-11-07`,`${year}-11-22`,`${year}-12-07`,`${year}-12-22`,`${year+1}-01-05`,`${year+1}-01-20`,`${year+1}-02-04`];
 return ["lidong","xiaoxue","daxue","dongzhi","xiaohan","dahan"].map((term,j)=>({id:fixtureId(9000+i*10+j),calendarVersion:"TEST_ONLY_v1",termCode:term,season:"winter",startDate:dates[j]!,endDate:dates[j+1]!,timezone:"Asia/Shanghai",sourceRef:"SYNTHETIC TEST ONLY",reviewRef:"TEST ONLY - NOT REAL REVIEW"}));
});
