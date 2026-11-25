import {z} from "zod";
import type pg from "pg";
import {dictionaryKinds} from "../../domain/content/dictionary";
import {WINTER_TERMS} from "../../domain/recipes/types";
import {withTransaction} from "../db/pool";

const text=z.string().trim().min(1).max(500);
const period=z.object({id:z.uuid(),termCode:z.string().regex(/^[a-z]{2,24}$/),season:z.enum(["spring","summer","autumn","winter"]),startDate:z.iso.date(),endDate:z.iso.date(),sourceRef:text,reviewRef:text}).strict();
const calendar=z.object({version:text,periods:z.array(period).min(12),hou:z.array(z.object({
  periodId:z.uuid(),startDate:z.iso.date(),endDate:z.iso.date(),name:text,text,sourceRef:text,reviewRef:text,
}).strict()).default([])}).strict();
export const reviewConfig=z.object({
  dictionary:z.array(z.object({kind:z.enum(dictionaryKinds),id:z.string().trim().min(1).max(100),label:text,sourceRef:text,reviewRef:text,approvedAt:z.iso.datetime()}).strict()).optional(),
  calendar:calendar.optional(),
}).strict();

export function loadReviewConfig(pool:pg.Pool,input:z.input<typeof reviewConfig>){
  const data=reviewConfig.parse(input);
  return withTransaction(pool,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shiyoushu.review.config',0))");
    for(const option of data.dictionary??[]){
      if(Date.parse(option.approvedAt)>Date.now())throw new Error("REVIEW_DATE_IN_FUTURE");
      await client.query(`INSERT INTO reviewed_dictionary(kind,canonical_id,label,source_ref,review_ref,approved_at)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kind,canonical_id) DO UPDATE SET label=EXCLUDED.label,source_ref=EXCLUDED.source_ref,
        review_ref=EXCLUDED.review_ref,approved_at=EXCLUDED.approved_at`,[option.kind,option.id,option.label,option.sourceRef,option.reviewRef,option.approvedAt]);
    }
    const entries=data.calendar;
    if(entries){
      const sorted=[...entries.periods].sort((a,b)=>a.startDate.localeCompare(b.startDate));
      const years=new Set(sorted.map(p=>p.startDate.slice(0,4)));
      if(years.size<2||WINTER_TERMS.some(term=>!sorted.some(p=>p.termCode===term&&p.season==="winter")))throw new Error("MISSING_WINTER_COVERAGE");
      if(sorted.some((p,i)=>p.startDate>=p.endDate||(i>0&&sorted[i-1]?.endDate!==p.startDate)||
        (p.season==="winter")!==WINTER_TERMS.some(term=>term===p.termCode)))throw new Error("INVALID_CALENDAR_BOUNDARY");
      for(const p of sorted){
        await client.query(`INSERT INTO calendar_period(id,calendar_version,term_code,season,start_date,end_date,source_ref,review_ref)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[p.id,entries.version,p.termCode,p.season,p.startDate,p.endDate,p.sourceRef,p.reviewRef]);
      }
      for(const h of entries.hou){
        const p=sorted.find(item=>item.id===h.periodId);
        if(!p||p.season!=="winter"||h.startDate<p.startDate||h.endDate>p.endDate||h.startDate>=h.endDate)throw new Error("INVALID_HOU_BOUNDARY");
        await client.query(`INSERT INTO hou_content(period_id,start_date,end_date,name,text,source_ref,review_ref,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,'approved')`,[h.periodId,h.startDate,h.endDate,h.name,h.text,h.sourceRef,h.reviewRef]);
      }
      await client.query("INSERT INTO calendar_active(singleton,calendar_version) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET calendar_version=EXCLUDED.calendar_version",[entries.version]);
    }
    return {dictionaryCount:data.dictionary?.length??0,calendarVersion:entries?.version??null};
  });
}
