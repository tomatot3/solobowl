import type pg from "pg";
import type {RecipeVersion} from "../../domain/recipes/types";
export async function insertReviewedVersion(client:pg.PoolClient,v:RecipeVersion){
   await client.query(`INSERT INTO recipe_version(id,recipe_id,internal_revision,raw_version,source_hash,content_hash,name,image,prep_minutes,cook_minutes,difficulty,equipment,season,term_codes,tags,dish_type,completeness,allergen_ids,allergens_reviewed,restriction_ids)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,[v.id,v.recipeId,v.internalRevision,v.rawVersion,v.sourceHash,v.contentHash,v.name,v.image,v.prepMinutes,v.cookMinutes,v.difficulty,v.equipment,v.season,v.termCodes,v.tags,v.dishType,v.completeness,v.allergenIds,v.allergensReviewed,v.restrictionIds]);
   for(const s of v.sources)await client.query("INSERT INTO source_evidence(id,version_id,source_type,citation,evidence_level,directory_version,source_location,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[s.id,v.id,s.sourceType,s.citation,s.evidenceLevel,s.directoryVersion,s.sourceLocation,s.sourceHash]);
   for(const r of v.reviews)await client.query("INSERT INTO content_review(id,version_id,scope,status,reviewer,reviewed_at,evidence_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[r.id,v.id,r.scope,r.status,r.reviewer,r.reviewedAt,r.evidenceId]);
   for(const l of v.ingredients)await client.query("INSERT INTO ingredient_line(id,version_id,ordinal,ingredient_id,raw_name,role,amount_kind,quantity,unit,quantity_text,optional,shopping_included) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[l.id,v.id,l.order,l.ingredientId,l.rawName,l.role,l.amount.kind,l.amount.kind==="numeric"?l.amount.quantity:null,l.amount.kind==="numeric"?l.amount.unit:null,l.amount.kind==="text"?l.amount.text:null,l.optional,l.shoppingIncluded]);
   for(const s of v.steps){
    await client.query("INSERT INTO recipe_step(id,version_id,ordinal,instruction,heat,duration_seconds,timer_start_cue,completion_cue,safety_notice) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[s.id,v.id,s.order,s.instruction,s.heat,s.durationSeconds,s.timerStartCue,s.completionCue,s.safetyNotice]);
    for(const line of s.ingredientLineIds)await client.query("INSERT INTO step_ingredient(version_id,step_id,line_id) VALUES($1,$2,$3)",[v.id,s.id,line]);
   }
   for(const o of v.servingOptions){
    await client.query("INSERT INTO serving_option(id,version_id,servings,review_ref) VALUES($1,$2,$3,$4)",[o.id,v.id,o.servings,o.reviewRef]);
    for(const q of o.ingredientQuantities)await client.query("INSERT INTO serving_quantity(version_id,option_id,line_id,quantity,unit,quantity_text) VALUES($1,$2,$3,$4,$5,$6)",[v.id,o.id,q.ingredientLineId,q.quantity,q.unit,q.quantityText]);
    for(const s of o.stepOverrides)await client.query("INSERT INTO serving_step_override(version_id,option_id,step_id,duration_seconds,heat) VALUES($1,$2,$3,$4,$5)",[v.id,o.id,s.stepId,s.durationSeconds,s.heat]);
   }
   await client.query("UPDATE recipe_version SET sealed=true WHERE id=$1",[v.id]);
}
