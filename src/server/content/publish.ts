import {createHash} from "node:crypto";
import type pg from "pg";
import {z} from "zod";
import {withTransaction} from "../db/pool";
import {entityId,revision,utcInstant} from "../../domain/shared/validation";
import type {RecipeVersion} from "../../domain/recipes/types";
import {eligibility} from "../../domain/recommendations/eligibility";
import {genericContext} from "../recipes/availability";
import {createRecipeRepository} from "../recipes/repository";
import {insertReviewedVersion} from "./version-writer";
import {validateCover} from "./media";
import {validateProvenance} from "./provenance";
import type {StagedRecipe} from "../../domain/content/normalize";

const text=z.string().trim().min(1).max(240);
const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const publicationInput=z.object({
  draftId:z.uuid(), sourceHash:sha, draftHash:sha, operatorRef:text, reviewRef:text,
  dictionaryReviewRef:text, allowUnknownTotal:z.boolean().default(false),
  version:z.custom<RecipeVersion>(value=>Boolean(value)&&typeof value==="object"),
}).strict();

export async function publishReviewed(pool:pg.Pool,input:z.infer<typeof publicationInput>,transaction?:pg.PoolClient){
  async function publish(client:pg.PoolClient){
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shiyoushu.content.publish',0))");
    const draft=(await client.query<{source_id:string;raw_version:string;review_state:string;source_hash:string;content_hash:string;published_version_id:string|null;draft:Partial<StagedRecipe>}>(`SELECT source_id,raw_version,review_state,source_hash,content_hash,published_version_id,draft
      FROM content_draft WHERE id=$1 FOR UPDATE`,[input.draftId])).rows[0];
    if(!draft||draft.review_state!=="pending"||draft.source_hash!==input.sourceHash||draft.content_hash!==input.draftHash)throw new Error("DRAFT_REVIEW_IDENTITY_MISMATCH");
    if(draft.published_version_id)throw new Error("DRAFT_ALREADY_PUBLISHED");
    const version=input.version;
    const id=entityId(version.id),recipeId=entityId(version.recipeId);
    if(version.rawVersion!==draft.raw_version||version.sourceHash!==input.sourceHash||version.season!=="winter")throw new Error("DRAFT_REVIEW_IDENTITY_MISMATCH");
    if(version.totalMinutes===null&&!input.allowUnknownTotal)throw new Error("UNKNOWN_TOTAL_REVIEW_REQUIRED");
    if(!version.allergensReviewed||!Array.isArray(version.allergenIds))throw new Error("ALLERGEN_REVIEW_REQUIRED");
    if(!version.reviews.every(review=>review.versionId===id&&review.status==="approved"&&Boolean(review.reviewer?.trim())&&review.reviewedAt!==null
      &&Number.isFinite(Date.parse(review.reviewedAt))&&Date.parse(review.reviewedAt)<=Date.now()))throw new Error("INVALID_REVIEW_RECORD");
    const existing=(await client.query<{id:string;current_published_version_id:string|null}>(
      "SELECT id,current_published_version_id FROM recipe WHERE source_id=$1 FOR UPDATE",[draft.source_id])).rows[0];
    if(existing&&existing.id!==recipeId)throw new Error("RECIPE_ID_MISMATCH");
    const previous=(await client.query<{revision:number}>("SELECT COALESCE(max(internal_revision),0)::int AS revision FROM recipe_version WHERE recipe_id=$1",[recipeId])).rows[0]!.revision;
    if(version.internalRevision!==previous+1)throw new Error("VERSION_REVISION_MISMATCH");
    const snapshot={...version,contentHash:""};
    const contentHash=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const candidate={recipe:{id:recipeId,sourceId:draft.source_id,currentPublishedVersionId:id},version:{...snapshot,contentHash},
      lifecycle:{versionId:id,state:"published" as const,revision:revision(0),changedAt:utcInstant(new Date().toISOString()),withdrawalReason:null}};
    if(!eligibility(candidate,genericContext).eligible)throw new Error("CONTENT_NOT_ELIGIBLE");
    validateProvenance(version);
    await validateCover(version.image,draft.draft.images?.filter(binding=>/^AA[1-9]\d*$/.test(binding.cell))??[]);
    if(!existing)await client.query("INSERT INTO recipe(id,source_id) VALUES($1,$2)",[recipeId,draft.source_id]);
    await insertReviewedVersion(client,candidate.version);
    await client.query("INSERT INTO recipe_lifecycle(version_id,recipe_id,state) VALUES ($1,$2,'reviewed')",[id,recipeId]);
    const persisted=await createRecipeRepository(pool,client).getVersion(id);
    if(!persisted||persisted.version.totalMinutes!==version.totalMinutes)throw new Error("REVIEWED_DURATION_MISMATCH");
    if(existing?.current_published_version_id){
      await client.query("UPDATE recipe_lifecycle SET state='archived',revision=revision+1,changed_at=now() WHERE version_id=$1",[existing.current_published_version_id]);
      await client.query("INSERT INTO content_release_event(version_id,before_state,after_state,operator_ref,review_ref) VALUES($1,'published','archived',$2,$3)",
        [existing.current_published_version_id,input.operatorRef,input.reviewRef]);
    }
    await client.query("UPDATE recipe_lifecycle SET state='published',revision=revision+1,changed_at=now() WHERE version_id=$1",[id]);
    await client.query("UPDATE recipe SET current_published_version_id=$1 WHERE id=$2",[id,recipeId]);
    await client.query("INSERT INTO content_release_event(version_id,before_state,after_state,operator_ref,review_ref) VALUES($1,'reviewed','published',$2,$3)",
      [id,input.operatorRef,input.reviewRef+" / "+input.dictionaryReviewRef]);
    await client.query("UPDATE content_draft SET published_version_id=$1 WHERE id=$2",[id,input.draftId]);
    return {versionId:id,recipeId,contentHash};
  }
  return transaction?publish(transaction):withTransaction(pool,publish);
}
