import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {seedTestFixtures} from "../support/seed-fixtures";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {findRecipes,recipeFilters} from "../../src/server/recipes/query";
import {createRecipeRepository} from "../../src/server/recipes/repository";
import {genericContext} from "../../src/server/recipes/availability";
import {createFavoriteService} from "../../src/server/favorites/service";
import {createMergeService} from "../../src/server/merge/service";
import {accountId,entityId} from "../../src/domain/shared/validation";

it("keeps results eligible and stores a unique account favorite even across repeat merge imports",async()=>{
  const db=await isolatedSchema();
  try{
    await runMigrations(db.pool,await loadMigrations());
    await seedTestFixtures(db.pool);
    const repository=createRecipeRepository(db.pool);
    const results=await findRecipes(repository,genericContext,recipeFilters.parse({ingredient:"TEST",difficulty:"easy",maxMinutes:15}));
    expect(results.items.length).toBeGreaterThan(0);
    expect(results.items.every(item=>item.totalMinutes==="15")).toBe(true);
    const excluded=await findRecipes(repository,{...genericContext,avoidedIngredientIds:["test-ingredient"]},recipeFilters.parse({}));
    expect(excluded.items).toEqual([]);
    const id=accountId(randomUUID());
    const other=accountId(randomUUID());
    for(const account of [id,other])await db.pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[account,"TEST",account+"@example.invalid"]);
    const item=results.items[0]!;
    const favorites=createFavoriteService(db.pool);
    const first=await favorites.change(id,entityId(item.recipeId),{saved:true,versionId:entityId(item.versionId)});
    await favorites.change(id,entityId(item.recipeId),{saved:true,versionId:entityId(item.versionId)});
    const merge=createMergeService(db.pool,"fixture-secret");
    const result=await merge.start(id,{guestBatchId:randomUUID(),consent:true,schemaVersion:1,records:[],favorites:[item,item].map(({recipeId,versionId})=>({recipeId,versionId}))});
    expect(result.applied).toEqual(["favorites:1"]);
    expect(await favorites.list(id)).toHaveLength(1);
    expect(await favorites.list(other)).toEqual([]);
    await favorites.change(id,entityId(item.recipeId),{saved:false,baseRevision:first!.revision,deletionGeneration:0});
    const replay=await merge.start(id,{guestBatchId:randomUUID(),consent:true,schemaVersion:1,records:[],favorites:[{recipeId:item.recipeId,versionId:item.versionId}]});
    expect(replay.applied).toEqual(["favorites_skipped:1"]);
    expect(await favorites.list(id)).toEqual([]);
  }finally{await db.close();}
});
