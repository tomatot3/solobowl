import type {Recipe,RecipeVersion,RecipeLifecycle} from "../recipes/types";
import {quantity} from "../shared/validation";
export type RecipeCandidate={readonly recipe:Recipe;readonly version:RecipeVersion;readonly lifecycle:RecipeLifecycle};
export type EligibilityContext={readonly allergenIds:readonly string[];readonly avoidedIngredientIds:readonly string[];readonly restrictionIds:readonly string[];readonly equipment:{readonly status:"unknown"}|{readonly status:"known";readonly availableIds:readonly string[]};readonly maxMinutes:string|null;readonly safetyConflict:boolean};
export type ExclusionReason="outside_scope"|"not_published"|"not_current"|"invalid_content"|"safety_unknown"|"safety_excluded"|"equipment_excluded"|"time_excluded";
export type EligibilityResult={eligible:true}|{eligible:false;reason:ExclusionReason};
function hardLimit(context:EligibilityContext){
 if(context.safetyConflict)throw new Error("SAFETY_CONFLICT");
 if(context.maxMinutes===null)return null;
 try{const limit=quantity(context.maxMinutes);if(!limit||limit.lte(0))throw new Error();return limit;}catch{throw new Error("INVALID_HARD_TIME");}
}
function contentValid(v:RecipeVersion):boolean{
 if(!v.ingredients.length||!v.steps.length||!v.sources.length)return false;
 try{
  const completeness=quantity(v.completeness),prep=quantity(v.prepMinutes),cook=quantity(v.cookMinutes),total=quantity(v.totalMinutes);
  if(!completeness||completeness.gt(1)||(prep===null||cook===null?total!==null:total===null||!prep.plus(cook).eq(total)))return false;
  if(v.ingredients.some(l=>!l.ingredientId||!l.rawName.trim()||(l.role==="auxiliary_water"&&l.shoppingIncluded)||l.amount.kind==="unknown"||(l.amount.kind==="numeric"&&(quantity(l.amount.quantity)===null||!l.amount.unit?.trim()))||(l.amount.kind==="text"&&!l.amount.text.trim())))return false;
  if(v.steps.some(s=>!s.instruction.trim()||s.durationSeconds!==null&&(!Number.isSafeInteger(s.durationSeconds)||s.durationSeconds<0)))return false;
  if(!v.servingOptions.some(o=>quantity(o.servings)?.eq(1)))return false;
  if(v.servingOptions.some(o=>{const servings=quantity(o.servings);return !servings||servings.lte(0)||o.ingredientQuantities.some(q=>q.quantity===null?!q.quantityText?.trim():quantity(q.quantity)===null||!q.unit?.trim()||q.quantityText!==null);}))return false;
 }catch{return false;}
 const approved=v.reviews.filter(r=>r.versionId===v.id&&r.status==="approved"&&!!r.reviewer&&!!r.reviewedAt&&v.sources.some(s=>s.id===r.evidenceId&&s.versionId===v.id));
 if(!(["content","servings","steps","sources","dictionary","safety"] as const).every(scope=>approved.some(r=>r.scope===scope)))return false;
 if(!v.ingredients.every((l,i)=>l.versionId===v.id&&l.order===i+1)||!v.steps.every((s,i)=>s.versionId===v.id&&s.order===i+1&&s.ingredientLineIds.every(id=>v.ingredients.some(l=>l.id===id))))return false;
 return v.servingOptions.every(o=>o.versionId===v.id&&approved.some(r=>r.id===o.reviewRef&&r.scope==="servings")&&o.ingredientQuantities.length===v.ingredients.length&&new Set(o.ingredientQuantities.map(q=>q.ingredientLineId)).size===v.ingredients.length&&v.ingredients.every(l=>o.ingredientQuantities.some(q=>q.ingredientLineId===l.id)));
}
/** Call before scoring, for every search/recommendation path. Alternatives must
 * come from reviewed content/catalogue, never client claims or guessed synonyms. */
export function eligibility(candidate:RecipeCandidate,context:EligibilityContext,approvedAlternatives:Readonly<Record<string,readonly string[]>>={}):EligibilityResult{
 const limit=hardLimit(context);const {recipe,version:v,lifecycle}=candidate;
 const excluded=(reason:ExclusionReason):EligibilityResult=>({eligible:false,reason});
 if(v.season!=="winter")return excluded("outside_scope");
 if(lifecycle.versionId!==v.id||lifecycle.state!=="published")return excluded("not_published");
 if(recipe.id!==v.recipeId||recipe.currentPublishedVersionId!==v.id)return excluded("not_current");
 if(!contentValid(v))return excluded("invalid_content");
 const safety=safetyExclusion(v,context);
 if(safety)return excluded(safety);
 const equipment=context.equipment;
 if(equipment.status==="known"&&v.equipment?.some(required=>!equipment.availableIds.includes(required)&&!(approvedAlternatives[required]??[]).some(id=>equipment.availableIds.includes(id))))return excluded("equipment_excluded");
 if(limit){try{const total=quantity(v.totalMinutes);if(total===null||total.gt(limit))return excluded("time_excluded");}catch{return excluded("invalid_content");}}
 return {eligible:true};
}
export function safetyExclusion(v:RecipeCandidate["version"],context:EligibilityContext) {
 if(context.allergenIds.length&&(!v.allergensReviewed||v.allergenIds===null))return "safety_unknown" as const;
 const ingredientIds=v.ingredients.map(l=>l.ingredientId).filter((id):id is string=>id!==null);
 if(context.allergenIds.some(id=>v.allergenIds?.includes(id)||ingredientIds.includes(id))||context.avoidedIngredientIds.some(id=>ingredientIds.includes(id))||context.restrictionIds.some(id=>v.restrictionIds.includes(id)))return "safety_excluded" as const;
}
export function filterEligible(candidates:readonly RecipeCandidate[],context:EligibilityContext,approvedAlternatives:Readonly<Record<string,readonly string[]>>={}){
 hardLimit(context);const eligible:RecipeCandidate[]=[];const excluded:{versionId:string;reason:ExclusionReason}[]=[];
 for(const candidate of candidates){const result=eligibility(candidate,context,approvedAlternatives);if(result.eligible)eligible.push(candidate);else excluded.push({versionId:candidate.version.id,reason:result.reason});}
 return {eligible,excluded};
}
