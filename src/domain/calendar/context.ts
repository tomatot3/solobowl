import {businessDate,BUSINESS_TIMEZONE} from "./clock";
import {WINTER_TERMS,type CalendarPeriod,type HouContent,type Season} from "../recipes/types";
export type SeasonContext={serverTime:string;businessDate:string;timezone:typeof BUSINESS_TIMEZONE;calendarVersion:string|null;scope:"winter_open"|"scope_closed"|"calendar_unavailable";winterLibraryAvailable:true;currentTerm?:string;season?:Season;houContent?:{name:string;text:string;sourceRef:string}};
export function resolveSeasonContext(now:Date,periods:readonly CalendarPeriod[],hou:readonly HouContent[]=[]):SeasonContext{
 const date=businessDate(now);const base:SeasonContext={serverTime:now.toISOString(),businessDate:date,timezone:BUSINESS_TIMEZONE,calendarVersion:null,scope:"calendar_unavailable",winterLibraryAvailable:true};
 const matches=periods.filter(p=>p.timezone===BUSINESS_TIMEZONE&&p.sourceRef.trim()&&p.reviewRef.trim()&&p.startDate<=date&&date<p.endDate);
 if(matches.length!==1)return base;
 const period=matches[0]!;const winter=period.season==="winter"&&WINTER_TERMS.some(t=>t===period.termCode);
 if(period.season==="winter"&&!winter)return base;
 const approved=hou.filter(h=>h.periodId===period.id&&h.status==="approved"&&h.reviewRef.trim()&&h.sourceRef.trim()&&h.startDate>=period.startDate&&h.endDate<=period.endDate&&h.startDate<=date&&date<h.endDate);
 return {...base,calendarVersion:period.calendarVersion,currentTerm:period.termCode,season:period.season,scope:winter?"winter_open":"scope_closed",...(winter&&approved.length===1?{houContent:{name:approved[0]!.name,text:approved[0]!.text,sourceRef:approved[0]!.sourceRef}}:{})};
}
