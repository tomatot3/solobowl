import {z} from "zod";
import type {Clock} from "../../domain/calendar/clock";
import type {SeasonContext} from "../../domain/calendar/context";
import type {ContentPort} from "../../domain/shared/ports";
import type {WinterTerm} from "../../domain/recipes/types";
import {filterEligible,type EligibilityContext} from "../../domain/recommendations/eligibility";
import {scoreWithPreferences,type OrdinaryPreferences} from "../../domain/recommendations/preference-scoring";
import {hasMealCondition,mealRequestInput} from "../../domain/recommendations/meal-request";
import {selectRecommendations} from "../../domain/recommendations/selection";
import {ApiError,createMeta,handleApi} from "../http/envelope";
import {assertSafeWrite,assertJsonMutation} from "../http/access";
import {genericContext} from "../recipes/availability";
import {enhanceReasons,templates,type AiCandidate,type Factor,type Provider} from "../ai/enhance";
import {preferenceValues} from "../../domain/profile/sections";
const ids=z.array(z.string().min(1).max(100)).max(50);
export const guestSchema=z.object({safety:z.object({consent:z.literal(true),allergenIds:ids.default([]),avoidedIngredientIds:ids.default([]),restrictionIds:ids.default([])}).strict().optional(),equipment:z.discriminatedUnion("status",[z.object({status:z.literal("unknown")}).strict(),z.object({status:z.literal("known"),availableIds:ids}).strict()]).optional(),preferences:preferenceValues.extend({consent:z.literal(true)}).strict().optional()}).strict();
const inputSchema=z.object({enhanceRequested:z.boolean().optional(),guestContext:guestSchema.optional(),mealRequest:mealRequestInput.optional(),excludeRecipeId:z.uuid().optional()}).strict();
export type AccessResolution={kind:"guest"}|{kind:"account";context:EligibilityContext;preferences?:OrdinaryPreferences;aiConsent?:boolean};
export function effectiveEligibility(access:AccessResolution,guest?:z.infer<typeof guestSchema>):EligibilityContext{
 if(access.kind==="account")return access.context;
 return {...genericContext,allergenIds:guest?.safety?.allergenIds??[],avoidedIngredientIds:guest?.safety?.avoidedIngredientIds??[],restrictionIds:guest?.safety?.restrictionIds??[],equipment:guest?.equipment??{status:"unknown"}};
}
/** Temporary fail-closed boundary until T033/T044 supplies trusted account access.
 * Client userId/owner fields are never accepted as an identity. */
export async function resolvePreAuthAccess(request:Request):Promise<AccessResolution>{
 if(request.headers.has("authorization")||/better-auth|session[_-]?token/i.test(request.headers.get("cookie")??""))throw new ApiError("NOT_READY");return {kind:"guest"};
}
export type RecommendationDependencies={clock:Clock;baseUrl:string;content:ContentPort;season:(now:Date)=>Promise<SeasonContext>;resolveAccess:(request:Request)=>Promise<AccessResolution>;provider?:Provider;
 audit?:(event:{runId:string;ruleVersion:string;mode:string;calendarVersion:string|null;versions:string[];ai:{status:string;fallbackCode:string|null;calls:number};elapsed:number})=>Promise<void>};
export function createRecommendationHandler(deps:RecommendationDependencies){
 return async(request:Request)=>{
  const started=performance.now();
  const now=deps.clock.now(),meta=createMeta(now);return handleApi(async()=>{
   assertSafeWrite(request,deps.baseUrl);assertJsonMutation(request);
   const text=await request.text();if(text.length>16384)throw new ApiError("INVALID_INPUT");
   let raw:unknown;try{raw=JSON.parse(text);}catch{throw new ApiError("INVALID_INPUT");}
   const input=inputSchema.safeParse(raw);if(!input.success)throw new ApiError("INVALID_INPUT");
   const {mealRequest:meal,guestContext,excludeRecipeId}=input.data;
   if(meal&&!hasMealCondition(meal))throw new ApiError("NEED_MEAL_CONDITION");
   function settings(access:AccessResolution){
    const context=effectiveEligibility(access,guestContext);
    if(context.safetyConflict)throw new ApiError("SAFETY_CONFLICT");
    const equipment=meal?.equipmentIds?.length?{status:"known" as const,availableIds:context.equipment.status==="known"
      ? meal.equipmentIds.filter(id=>context.equipment.status==="known"&&context.equipment.availableIds.includes(id)) : meal.equipmentIds}:context.equipment;
    const guestPreference=guestContext?.preferences;
    return {context:{...context,equipment,maxMinutes:meal?.maxMinutes===undefined?context.maxMinutes:String(meal.maxMinutes)},
      preferences:access.kind==="account"?access.preferences:guestPreference?{...guestPreference,preferredMinutes:guestPreference.preferredMinutes??undefined}:undefined,aiConsent:access.kind==="account"&&access.aiConsent===true};
   }
   const {context,preferences,aiConsent}=settings(await deps.resolveAccess(request));
   if(context.safetyConflict)throw new ApiError("SAFETY_CONFLICT");
   const season=await deps.season(now);if(season.scope==="calendar_unavailable")throw new ApiError("CALENDAR_UNAVAILABLE");
   let ai:{status:string;fallbackCode:string|null;calls:number}={status:input.data.enhanceRequested?"skipped":"not_requested",fallbackCode:null,calls:0};
   const base={runId:meta.requestId,mode:meal?"C":preferences?"B":"A",ruleVersion:"winter-rules-v2",calendarVersion:season.calendarVersion};
   if(season.scope==="scope_closed")return {...base,ai,status:"scope_closed",results:[]};
   async function candidates(context:EligibilityContext){
    const contents=(await deps.content.listCurrentWinter()).filter(candidate=>candidate.recipe.id!==excludeRecipeId);
    return filterEligible(contents,context).eligible;
   }
   let selected=selectRecommendations((await candidates(context)).map(c=>scoreWithPreferences(c,season.currentTerm as WinterTerm,preferences,meal)));
   let modelFactors:ReadonlyMap<string,readonly Factor[]>|undefined;
   if(input.data.enhanceRequested&&selected.length){
    if(!aiConsent)ai={status:"skipped",fallbackCode:"consent_missing",calls:0};
    else if(!deps.provider)ai={status:"skipped",fallbackCode:"provider_error",calls:0};
    else{
      const candidates:AiCandidate[]=selected.map(item=>({recipeId:item.candidate.recipe.id,versionId:item.candidate.version.id,role:item.role,
        factors:[item.factors.term===100?"season_term":"winter_recipe",...(meal?.maxMinutes!==undefined?["within_time_limit" as const]:[])]}));
      const result=await enhanceReasons(deps.provider,candidates,season.currentTerm??"",request.signal);
      ai={status:result.status,fallbackCode:result.code??null,calls:result.calls};
      modelFactors=result.factors;
    }
   }
   // Recheck lifecycle and eligibility immediately before returning identities.
   const results=[];
   const final=selected.length?settings(await deps.resolveAccess(request)):null;
   let finalContext=context;
   if(final){
    finalContext=final.context;
    const changed=JSON.stringify(final.context)!==JSON.stringify(context)||JSON.stringify(final.preferences)!==JSON.stringify(preferences);
    const versions=await Promise.all(selected.map(item=>deps.content.getVersion(item.candidate.version.id)));
    const stale=versions.some((version,index)=>!version||version.version.contentHash!==selected[index]?.candidate.version.contentHash||!filterEligible([version],finalContext).eligible.length);
    if(changed||stale){
      if(ai.calls)ai={status:"fallback",fallbackCode:"stale_candidate",calls:ai.calls};
      modelFactors=undefined;
      selected=selectRecommendations((await candidates(finalContext))
        .map(candidate=>scoreWithPreferences(candidate,season.currentTerm as WinterTerm,final.preferences,meal)));
    }else if(ai.calls&&!final.aiConsent){ai={status:"fallback",fallbackCode:"consent_missing",calls:ai.calls};modelFactors=undefined;}
   }
   for(const result of selected){
    const latest=await deps.content.getVersion(result.candidate.version.id);
    if(!latest||!filterEligible([latest],finalContext).eligible.length)throw new ApiError("NOT_READY");
    const v=latest.version;
    const reasons=[result.factors.term===100?"匹配当前节气":"来自已审核冬季菜谱库"];
    if("time" in result.factors&&Number(result.factors.time)===100)reasons.push("符合用时偏好");
    if(meal?.maxMinutes!==undefined)reasons.push("在本餐时间上限内");
    const enhanced=modelFactors?.get(v.id);
    results.push({recipeId:latest.recipe.id,versionId:v.id,name:v.name,image:v.image,totalMinutes:v.totalMinutes,difficulty:v.difficulty,role:result.role,score:result.score.toFixed(2),factors:result.factors,reason:(enhanced?enhanced.map(factor=>templates[factor]):reasons).join("，")+"。"});
   }
   const mode=selected[0]?.mode??base.mode;
   if(input.data.enhanceRequested&&deps.audit){
     await deps.audit({...base,mode,versions:results.map(item=>item.versionId),ai,elapsed:Math.round(performance.now()-started)});
   }
   return {...base,ai,mode,status:results.length?"ready":"no_candidates",results};
  },meta);
 };
}
