import type pg from "pg";
import type {ContentPort} from "../../domain/shared/ports";
import type {EntityId} from "../../domain/shared/types";
import type {RecipeCandidate} from "../../domain/recommendations/eligibility";
import type {RecipeVersion,IngredientLine,Step,ServingOption,SourceEvidence,Review} from "../../domain/recipes/types";
/** SQL names are internal constants. Values are parameterized. Read every version
 * and its children in one repeatable-read snapshot, including lifecycle. */
function camel(row:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase()),value instanceof Date?value.toISOString():value]));}
export function createRecipeRepository(pool:pg.Pool,existing?:pg.PoolClient):ContentPort{
 async function read(id?:EntityId):Promise<RecipeCandidate[]>{
  const client=existing??await pool.connect();try{
   if(!existing)await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
   const rows=(await client.query(`SELECT v.*,r.source_id,r.current_published_version_id,l.state,l.revision AS lifecycle_revision,l.changed_at,l.withdrawal_reason FROM recipe_version v JOIN recipe r ON r.id=v.recipe_id JOIN recipe_lifecycle l ON l.version_id=v.id WHERE ${id?"v.id=$1":"v.id=r.current_published_version_id AND l.state='published' AND v.season='winter'"} ORDER BY v.id`,id?[id]:[])).rows;
   const results:RecipeCandidate[]=[];
   for(const row of rows){
    const v=camel(row);const children=async(table:string)=> (await client.query(`SELECT * FROM ${table} WHERE version_id=$1`,[row.id])).rows.map(camel);
    const lines=await children("ingredient_line"),steps=await children("recipe_step"),links=await children("step_ingredient"),options=await children("serving_option"),quantities=await children("serving_quantity"),overrides=await children("serving_step_override"),sources=await children("source_evidence"),reviews=await children("content_review");
    const ingredients=lines.sort((a,b)=>Number(a.ordinal)-Number(b.ordinal)).map(l=>({id:l.id,versionId:l.versionId,order:l.ordinal,ingredientId:l.ingredientId,rawName:l.rawName,role:l.role,optional:l.optional,shoppingIncluded:l.shoppingIncluded,amount:l.amountKind==="numeric"?{kind:"numeric",quantity:l.quantity,unit:l.unit}:l.amountKind==="text"?{kind:"text",text:l.quantityText}:{kind:"unknown"}})) as IngredientLine[];
    const mappedSteps=steps.sort((a,b)=>Number(a.ordinal)-Number(b.ordinal)).map(s=>({...s,order:s.ordinal,ingredientLineIds:links.filter(l=>l.stepId===s.id).map(l=>l.lineId)})) as unknown as Step[];
    const servingOptions=options.sort((a,b)=>Number(a.servings)-Number(b.servings)).map(o=>({...o,ingredientQuantities:quantities.filter(q=>q.optionId===o.id).map(q=>({ingredientLineId:q.lineId,quantity:q.quantity,unit:q.unit,quantityText:q.quantityText})),stepOverrides:overrides.filter(s=>s.optionId===o.id).map(s=>({stepId:s.stepId,durationSeconds:s.durationSeconds,heat:s.heat}))})) as unknown as ServingOption[];
    const versionFields=["id","recipeId","internalRevision","rawVersion","sourceHash","contentHash","name","image","prepMinutes","cookMinutes","totalMinutes","difficulty","equipment","season","termCodes","tags","dishType","completeness","allergenIds","allergensReviewed","restrictionIds"] as const;
    const version={...Object.fromEntries(versionFields.map(key=>[key,v[key]])),ingredients,steps:mappedSteps,servingOptions,sources:sources as unknown as SourceEvidence[],reviews:reviews as unknown as Review[]} as unknown as RecipeVersion;
    results.push({recipe:{id:row.recipe_id,sourceId:row.source_id,currentPublishedVersionId:row.current_published_version_id},version,lifecycle:{versionId:row.id,state:row.state,revision:row.lifecycle_revision,changedAt:row.changed_at.toISOString(),withdrawalReason:row.withdrawal_reason}});
   }
   if(!existing)await client.query("COMMIT");return results;
  }catch(error){if(!existing)await client.query("ROLLBACK");throw error;}finally{if(!existing)client.release();}
 }
 return {listCurrentWinter:()=>read(),getVersion:async id=>(await read(id))[0]??null};
}
