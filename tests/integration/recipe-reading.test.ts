import {describe,it,expect} from "vitest";
import {isolatedSchema} from "../support/isolated-schema";
import {loadMigrations,runMigrations} from "../../src/server/db/migrate";
import {seedTestFixtures} from "../support/seed-fixtures";
import {createRecipeRepository} from "../../src/server/recipes/repository";
import {checkAvailability} from "../../src/server/recipes/availability";
import {fixtureId} from "../fixtures/recipes";
describe("read-only exact recipe versions",()=>{
 it("loads immutable ingredients/steps/options and excludes drafts from current discovery",async()=>{
  const db=await isolatedSchema();try{
   await runMigrations(db.pool,await loadMigrations());await seedTestFixtures(db.pool);
   const repo=createRecipeRepository(db.pool);const all=await repo.listCurrentWinter();expect(all).toHaveLength(4);
   const f=await repo.getVersion(fixtureId(101));expect(f?.version.ingredients[0]?.amount).toEqual({kind:"numeric",quantity:"100",unit:"g"});
   expect(f?.version).not.toHaveProperty("state");expect(f?.version).not.toHaveProperty("currentPublishedVersionId");expect(f?.version).not.toHaveProperty("lifecycleRevision");
   expect(f?.version.servingOptions[1]?.ingredientQuantities[0]?.quantity).toBe("180");expect(f?.version.steps[0]?.durationSeconds).toBeNull();
   expect((await repo.getVersion(fixtureId(501)))?.version.totalMinutes).toBeNull();
   expect(checkAvailability(f!,"create",fixtureId(104),new Date()).allowed).toBe(true);
   expect(checkAvailability(f!,"create",fixtureId(999),new Date()).allowed).toBe(false);
   for(const id of [401,601,701])expect(checkAvailability((await repo.getVersion(fixtureId(id)))!,"create",fixtureId(id+3),new Date()).allowed).toBe(false);
   expect(checkAvailability(f!,"start",fixtureId(104),new Date()).allowed).toBe(true);
  }finally{await db.close();}
 });
});
