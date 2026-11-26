import {z} from "zod";
import type pg from "pg";
import type {AccountId} from "../../domain/shared/types";
import type {EligibilityContext} from "../../domain/recommendations/eligibility";
import {NOTICE_VERSION,preferenceValues} from "../../domain/profile/sections";


import {withTransaction} from "../db/pool";

import {createProfileService} from "../profile/service";
import {readConfig} from "../config";
import {aiNoticeVersion,readAiConsent} from "../profile/ai-consent";
import {genericContext} from "../recipes/availability";


const entry=z.object({state:z.enum(["unknown","explicit_none","provided"]),ids:z.array(z.string())});
export function accountRecommendationContext(pool:pg.Pool,id:AccountId,existing?:pg.PoolClient) {
  const read=async (client:pg.PoolClient)=>{
    const profile=await createProfileService(pool,undefined,client).read(id);
    const pending=await client.query(`SELECT 1 FROM merge_conflict WHERE account_id=$1 AND section='safety'
      UNION ALL SELECT 1 FROM sync_conflict WHERE account_id=$1 AND section='safety' LIMIT 1`,[id]);
    const safety=profile.sections.safety;
    const active=profile.consents.some(grant=>grant.purpose==="safety"&&grant.id===safety?.consentRef&&grant.noticeVersion===NOTICE_VERSION);
    const equipment=profile.sections.equipment;
    const equipmentIds=equipment&&equipment.state!=="unknown"
      ? z.array(z.string()).parse(equipment.values.availableIds) : null;
    function ids(key:string) {
      if(!active||!safety||!Object.hasOwn(safety.values,key))return [];
      const value=entry.parse(safety.values[key]);
      return value.state==="provided"?value.ids:[];
    }
    const context:EligibilityContext={
      ...genericContext,
      safetyConflict:Boolean(pending.rowCount),
      allergenIds:ids("allergies"),
      avoidedIngredientIds:ids("avoidances"),
      restrictionIds:ids("professionalRestrictions"),
      equipment:equipmentIds?{status:"known",availableIds:equipmentIds}:{status:"unknown"},
    };
    const preference=profile.sections.preferences;
    const values=preferenceValues.safeParse(preference?.values);
    const consent=profile.consents.some(grant=>grant.purpose==="preferences"&&grant.id===preference?.consentRef&&grant.noticeVersion===NOTICE_VERSION);
    const ai=await readAiConsent(client,id,null,aiNoticeVersion(readConfig().AI_PROVIDER));
    return {context,preferences:consent&&values.success?{...values.data,preferredMinutes:values.data.preferredMinutes??undefined}:undefined,aiConsent:ai.granted};
  };
  return existing?read(existing):withTransaction(pool,read);
}
