import type pg from "pg";
import type {AccountId} from "../../domain/shared/types";
import type {Clock} from "../../domain/calendar/clock";
import {systemClock} from "../../domain/calendar/clock";
import type {TodayState} from "../../domain/profile/today-state";
import {updateToday} from "../../domain/profile/today-state";
import {withTransaction} from "../db/pool";
import {ApiError} from "../http/envelope";
export function createTodayStateService(pool:pg.Pool,clock:Clock=systemClock,existingClient?:pg.PoolClient){
 async function transaction<T>(id:AccountId,work:(client:pg.PoolClient,current:TodayState|undefined)=>Promise<T>){
  const execute=async (client:pg.PoolClient)=>{
   await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[id]);
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`today:${id}`]);
   await client.query("DELETE FROM today_state WHERE account_id=$1 AND business_date<>$2::date",[id,clock.businessDate()]);
   const current=(await client.query<TodayState>(`SELECT to_char(business_date,'YYYY-MM-DD') AS "businessDate",text,revision,to_char(expires_on_date,'YYYY-MM-DD') AS "expiresOnDate" FROM today_state WHERE account_id=$1`,[id])).rows[0];
   return work(client,current);
  };
  return existingClient?execute(existingClient):withTransaction(pool,execute);
 }
 return {
  read:(id:AccountId)=>transaction(id,async(_,current)=>current??null),
  save:async(id:AccountId,date:string,text:string,baseRevision:number)=>{
   if(date!==clock.businessDate()){await transaction(id,async()=>{});throw new ApiError("EXPIRED_STATE");}
   return transaction(id,async(client,current)=>{let value:TodayState;try{value=updateToday(current,date,text,baseRevision,clock);}catch(error){throw new ApiError(error instanceof Error&&error.message==="REVISION_CONFLICT"?"REVISION_CONFLICT":"INVALID_INPUT");}
    await client.query("INSERT INTO today_state(account_id,business_date,text,revision,expires_on_date) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id) DO UPDATE SET business_date=EXCLUDED.business_date,text=EXCLUDED.text,revision=EXCLUDED.revision,expires_on_date=EXCLUDED.expires_on_date,updated_at=now()",[id,value.businessDate,value.text,value.revision,value.expiresOnDate]);return value;
   });
  },
  remove:(id:AccountId,baseRevision:number)=>transaction(id,async(client,current)=>{if(current&&current.revision!==baseRevision)throw new ApiError("REVISION_CONFLICT");await client.query("DELETE FROM today_state WHERE account_id=$1",[id]);return {deleted:true};}),
 };
}
