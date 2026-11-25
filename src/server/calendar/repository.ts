import type pg from "pg";
import type {CalendarPeriod,HouContent} from "../../domain/recipes/types";
import {resolveSeasonContext} from "../../domain/calendar/context";
import {businessDate} from "../../domain/calendar/clock";
export async function readSeasonContext(pool:pg.Pool,now:Date){
 const date=businessDate(now);
 // Multiple matching versions are deliberately unavailable until maintenance
 // selects one catalogue. Never choose a source by lexical version ordering.
 const periods=(await pool.query<CalendarPeriod>(`SELECT id,calendar_version AS "calendarVersion",term_code AS "termCode",season,to_char(start_date,'YYYY-MM-DD') AS "startDate",to_char(end_date,'YYYY-MM-DD') AS "endDate",timezone,source_ref AS "sourceRef",review_ref AS "reviewRef" FROM calendar_period WHERE start_date<=$1::date AND end_date>$1::date
 AND (NOT EXISTS(SELECT 1 FROM calendar_active) OR calendar_version=(SELECT calendar_version FROM calendar_active))`,[date])).rows;
 const hou=periods.length===1?(await pool.query<HouContent>(`SELECT id,period_id AS "periodId",to_char(start_date,'YYYY-MM-DD') AS "startDate",to_char(end_date,'YYYY-MM-DD') AS "endDate",name,text,source_ref AS "sourceRef",review_ref AS "reviewRef",status FROM hou_content WHERE period_id=$1 AND status='approved' AND start_date<=$2::date AND end_date>$2::date`,[periods[0]!.id,date])).rows:[];
 return resolveSeasonContext(now,periods,hou);
}
