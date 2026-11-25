export const BUSINESS_TIMEZONE="Asia/Shanghai" as const;
export interface Clock{now():Date;businessDate():string}
const formatter=new Intl.DateTimeFormat("en-US",{timeZone:BUSINESS_TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"});
function validInstant(value:Date):void{if(!Number.isFinite(value.getTime()))throw new Error("INVALID_INSTANT");}
export function businessDate(instant:Date):string{
 validInstant(instant);const parts=formatter.formatToParts(instant);
 const part=(type:string)=>parts.find(p=>p.type===type)?.value;
 return `${part("year")}-${part("month")}-${part("day")}`;
}
export function nextBusinessDate(date:string):string{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("INVALID_BUSINESS_DATE");
 const parsed=new Date(`${date}T00:00:00.000Z`);
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error("INVALID_BUSINESS_DATE");
 parsed.setUTCDate(parsed.getUTCDate()+1);return parsed.toISOString().slice(0,10);
}
/** Inject only as a server/domain dependency in tests; never derive from request input. */
export function createClock(read:()=>Date):Clock{
 const now=()=>{const value=read();validInstant(value);return new Date(value.getTime());};
 return Object.freeze({now,businessDate:()=>businessDate(now())});
}
export const systemClock:Clock=createClock(()=>new Date());
