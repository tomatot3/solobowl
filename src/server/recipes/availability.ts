import {eligibility,safetyExclusion,type EligibilityContext,type RecipeCandidate} from "../../domain/recommendations/eligibility";
export const genericContext:EligibilityContext={allergenIds:[],avoidedIngredientIds:[],restrictionIds:[],equipment:{status:"unknown"},maxMinutes:null,safetyConflict:false};
export function checkAvailability(candidate:RecipeCandidate,action:string,servingOptionId:string,now:Date,context=genericContext){
 const option=candidate.version.servingOptions.find(o=>o.id===servingOptionId);
 const state=candidate.lifecycle.state;
 const safety=safetyExclusion(candidate.version,context);
 const reason=action==="create"?(()=>{
   const result=eligibility(candidate,context);
   return result.eligible?null:result.reason;
 })():!["start","resume","step"].includes(action)?"invalid_action"
   :state!=="archived"&&state!=="published"?"not_published"
   :candidate.version.season!=="winter"?"outside_scope":safety??null;
 return {lifecycle:state,statusRevision:candidate.lifecycle.revision,checkedAt:now.toISOString(),contentHash:candidate.version.contentHash,allowed:reason===null&&Boolean(option?.reviewRef),reason:reason??(!option?.reviewRef?"invalid_serving_option":"allowed")};
}
