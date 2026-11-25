import {nextBusinessDate,type Clock} from "../calendar/clock";
export type TodayState={businessDate:string;text:string;revision:number;expiresOnDate:string};
export function validateToday(date:string,text:string,clock:Clock):void{
 if(date!==clock.businessDate())throw new Error("EXPIRED_STATE");
 if(typeof text!=="string"||text.length>2000)throw new Error("INVALID_TODAY_TEXT");
}
export function updateToday(current:TodayState|undefined,date:string,text:string,baseRevision:number,clock:Clock):TodayState{
 validateToday(date,text,clock);const existing=current?.businessDate===date?current:undefined;
 if(!Number.isSafeInteger(baseRevision)||baseRevision<0||baseRevision!==(existing?.revision??0))throw new Error("REVISION_CONFLICT");
 return {businessDate:date,text,revision:baseRevision+1,expiresOnDate:nextBusinessDate(date)};
}
