import type pg from "pg";
import {lockAccount} from "../auth/account-access";
import type {AccountId,EntityId} from "../../domain/shared/types";
import {withTransaction} from "../db/pool";
import {ApiError} from "../http/envelope";
import {accountRecommendationContext} from "../recommendations/account-settings";
import {createRecipeRepository} from "../recipes/repository";
import {eligibility} from "../../domain/recommendations/eligibility";

type Row={recipeId:EntityId;versionId:EntityId;saved:boolean;revision:number;deletionGeneration:number};
export type FavoriteRecord={recipeId:EntityId;versionId:EntityId;name:string;state:"published"|"archived"|"safety_withdrawn";revision:number;deletionGeneration:number};

export function createFavoriteService(pool:pg.Pool,transaction?:pg.PoolClient) {
  const transact=<T>(work:(client:pg.PoolClient)=>Promise<T>)=>transaction?work(transaction):withTransaction(pool,work);
  async function current(client:pg.PoolClient,id:AccountId,recipeId:EntityId){
    return (await client.query<Row>(`SELECT f.recipe_id AS "recipeId",f.version_id AS "versionId",f.saved,f.revision,
      COALESCE(b.generation,0) AS "deletionGeneration" FROM favorite f LEFT JOIN sync_barrier b
      ON b.account_id=f.account_id AND b.entity_type='favorite' AND b.entity_id=f.recipe_id::text
      WHERE f.account_id=$1 AND f.recipe_id=$2`,[id,recipeId])).rows[0];
  }
  return {
    list: async(id:AccountId)=>{
      return (await (transaction??pool).query<FavoriteRecord>(`SELECT f.recipe_id AS "recipeId", f.version_id AS "versionId",
        v.name, l.state, f.revision, COALESCE(b.generation,0) AS "deletionGeneration"
        FROM favorite f JOIN recipe_version v ON v.id=f.version_id JOIN recipe_lifecycle l ON l.version_id=v.id
        LEFT JOIN sync_barrier b ON b.account_id=f.account_id AND b.entity_type='favorite' AND b.entity_id=f.recipe_id::text
        WHERE f.account_id=$1 AND f.saved ORDER BY f.updated_at DESC,f.recipe_id`,[id])).rows;
    },
    change: (id:AccountId,recipeId:EntityId,options:{versionId?:EntityId;saved:boolean;baseRevision?:number;deletionGeneration?:number;merge?:boolean})=>transact(async client=>{
      await lockAccount(client,id);
      const existing=await current(client,id,recipeId);
      if(options.merge&&existing?.deletionGeneration)throw new ApiError("DELETED_VALUE_CONFLICT");
      if(options.baseRevision!==undefined&&(existing?.revision??0)!==options.baseRevision)throw new ApiError("REVISION_CONFLICT");
      if(options.deletionGeneration!==undefined&&(existing?.deletionGeneration??0)!==options.deletionGeneration)throw new ApiError("REVISION_CONFLICT");
      if(existing?.saved===options.saved||(!existing&&!options.saved))return existing??null;
      const versionId=options.saved?options.versionId:existing?.versionId;
      if(!versionId)throw new ApiError("INVALID_INPUT");
      if(options.saved){
        const {context}=await accountRecommendationContext(pool,id,client);
        if(context.safetyConflict)throw new ApiError("SAFETY_CONFLICT");
        const candidate=await createRecipeRepository(pool,client).getVersion(versionId);
        if(!candidate||candidate.recipe.id!==recipeId||!eligibility(candidate,context).eligible)throw new ApiError("RESOURCE_NOT_FOUND");
        const allowed=await client.query(`SELECT v.id FROM recipe_version v JOIN recipe r ON r.id=v.recipe_id
          JOIN recipe_lifecycle l ON l.version_id=v.id WHERE v.id=$1 AND r.id=$2 AND r.current_published_version_id=v.id
          AND v.season='winter' AND l.state='published'`,[versionId,recipeId]);
        if(!allowed.rowCount)throw new ApiError("RESOURCE_NOT_FOUND");
      }
      await client.query(`INSERT INTO favorite(account_id,recipe_id,version_id,saved,revision) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(account_id,recipe_id) DO UPDATE SET version_id=EXCLUDED.version_id,saved=EXCLUDED.saved,
        revision=EXCLUDED.revision,updated_at=now()`,[id,recipeId,versionId,options.saved,(existing?.revision??0)+1]);
      return current(client,id,recipeId);
    }),
  };
}
