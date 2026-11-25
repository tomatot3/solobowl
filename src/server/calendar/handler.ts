import type {Clock} from "../../domain/calendar/clock";
import type {SeasonContext} from "../../domain/calendar/context";
import {ApiError,createMeta,handleApi} from "../http/envelope";
export function createSeasonHandler(clock:Clock,read:(now:Date)=>Promise<SeasonContext>){
 return async(request:Request)=>{
  const now=clock.now();return handleApi(async()=>{
   if([...new URL(request.url).searchParams.keys()].length)throw new ApiError("INVALID_INPUT");
   const context=await read(now);if(context.scope==="calendar_unavailable")throw new ApiError("CALENDAR_UNAVAILABLE");return context;
  },createMeta(now));
 };
}
