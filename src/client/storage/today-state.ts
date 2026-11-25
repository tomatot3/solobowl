import type {LocalStore} from "./database";
import {systemClock,type Clock} from "../../domain/calendar/clock";
import {updateToday,type TodayState} from "../../domain/profile/today-state";
export async function readToday(store:LocalStore,clock:Clock=systemClock):Promise<TodayState|null>{
 return await store.update<TodayState>("today_state","current",current=>current?.businessDate===clock.businessDate()?current:undefined)??null;
}
export async function saveToday(store:LocalStore,date:string,text:string,baseRevision:number,clock:Clock=systemClock){
 return (await store.update<TodayState>("today_state","current",current=>updateToday(current,date,text,baseRevision,clock)))!;
}
export async function deleteToday(store:LocalStore,baseRevision:number,clock:Clock=systemClock){
 await store.update<TodayState>("today_state","current",current=>{if(current?.businessDate===clock.businessDate()&&current.revision!==baseRevision)throw new Error("REVISION_CONFLICT");return undefined;});
}
