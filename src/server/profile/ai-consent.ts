import type pg from "pg";
import type {AccountId} from "../../domain/shared/types";
import {AI_NOTICE_VERSION,type AiConsentState} from "../../domain/profile/ai-consent";
import {withTransaction} from "../db/pool";
import {ApiError} from "../http/envelope";

export async function readAiConsent(db:pg.Pool|pg.PoolClient, id:AccountId, noticeUrl:string|null):Promise<AiConsentState>{
  const active=await db.query(`SELECT 1 FROM profile_consent WHERE account_id=$1 AND purpose='ai'
    AND notice_version=$2 AND revoked_at IS NULL`,[id,AI_NOTICE_VERSION]);
  return {noticeVersion:AI_NOTICE_VERSION,noticeUrl,granted:Boolean(active.rowCount)};
}

export async function setAiConsent(pool:pg.Pool,id:AccountId,noticeUrl:string|null,grant:boolean){
  if(grant&&!noticeUrl)throw new ApiError("NOT_READY");
  return withTransaction(pool,async client=>{
    const account=await client.query('SELECT 1 FROM "user" WHERE id=$1 AND "emailVerified" FOR UPDATE',[id]);
    if(!account.rowCount)throw new ApiError("AUTH_REQUIRED");
    const current=await readAiConsent(client,id,noticeUrl);
    if(grant&&current.granted)return current;
    await client.query("UPDATE profile_consent SET revoked_at=now() WHERE account_id=$1 AND purpose='ai' AND revoked_at IS NULL",[id]);
    if(grant)await client.query("INSERT INTO profile_consent(account_id,purpose,notice_version) VALUES($1,'ai',$2)",[id,AI_NOTICE_VERSION]);
    return {...current,granted:grant};
  });
}
