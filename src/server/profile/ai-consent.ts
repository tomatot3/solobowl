import type pg from "pg";
import {lockAccount} from "../auth/account-access";
import type {AccountId} from "../../domain/shared/types";
import {AI_NOTICE_VERSION,type AiConsentState} from "../../domain/profile/ai-consent";
import {withTransaction} from "../db/pool";
import {ApiError} from "../http/envelope";
import type {AppConfig} from "../config";

export function aiNoticeVersion(provider:AppConfig["AI_PROVIDER"]){
  return provider==="openai"?"p0-ai-openai-v1":AI_NOTICE_VERSION;
}

export async function readAiConsent(db:pg.Pool|pg.PoolClient, id:AccountId, noticeUrl:string|null, noticeVersion=AI_NOTICE_VERSION):Promise<AiConsentState>{
  const active=await db.query(`SELECT 1 FROM profile_consent WHERE account_id=$1 AND purpose='ai'
    AND notice_version=$2 AND revoked_at IS NULL`,[id,noticeVersion]);
  return {noticeVersion,noticeUrl,granted:Boolean(active.rowCount)};
}

export async function setAiConsent(pool:pg.Pool,id:AccountId,noticeUrl:string|null,grant:boolean,noticeVersion=AI_NOTICE_VERSION){
  if(grant&&!noticeUrl)throw new ApiError("NOT_READY");
  return withTransaction(pool,async client=>{
    await lockAccount(client,id);
    const current=await readAiConsent(client,id,noticeUrl,noticeVersion);
    if(grant&&current.granted)return current;
    await client.query("UPDATE profile_consent SET revoked_at=now() WHERE account_id=$1 AND purpose='ai' AND revoked_at IS NULL",[id]);
    if(grant)await client.query("INSERT INTO profile_consent(account_id,purpose,notice_version) VALUES($1,'ai',$2)",[id,noticeVersion]);
    return {...current,granted:grant};
  });
}
