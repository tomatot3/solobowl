import {describe,it,expect} from "vitest";
import {recipeFixture,invalidRecipes} from "../fixtures/recipes";
import {eligibility,filterEligible,type EligibilityContext} from "../../src/domain/recommendations/eligibility";
const empty:EligibilityContext={allergenIds:[],avoidedIngredientIds:[],restrictionIds:[],equipment:{status:"unknown"},maxMinutes:null,safetyConflict:false};
describe("one shared eligibility gate",()=>{
 it("permits generic use without personal information and filters before ranking",()=>{
  const f=recipeFixture();expect(eligibility(f,empty)).toEqual({eligible:true});
  expect(filterEligible([f,recipeFixture(2,"draft"),recipeFixture(3,"archived"),recipeFixture(4,"safety_withdrawn")],empty).eligible).toEqual([f]);
 });
 it("requires current winter published reviewed content regardless of completeness",()=>{
  expect(eligibility(recipeFixture(1,"published",{season:"summer"}),empty)).toMatchObject({eligible:false,reason:"outside_scope"});
  const f=recipeFixture();f.recipe={...f.recipe,currentPublishedVersionId:null};expect(eligibility(f,empty)).toMatchObject({reason:"not_current"});
  expect(eligibility(recipeFixture(1,"published",{reviews:[]}),empty)).toMatchObject({reason:"invalid_content"});
  expect(eligibility(invalidRecipes.missingSteps,empty)).toMatchObject({eligible:false});
 });
 it("excludes missing/unreviewed allergen information only when relevant restrictions exist",()=>{
  expect(eligibility(invalidRecipes.missingAllergens,empty)).toEqual({eligible:true});
  for(const candidate of [invalidRecipes.missingAllergens,recipeFixture(1,"published",{allergenIds:["test-allergen"]})])expect(eligibility(candidate,{...empty,allergenIds:["test-allergen"]})).toMatchObject({eligible:false});
 });
 it("never offsets allergy, avoided ingredients or professional restrictions with score",()=>{
  expect(eligibility(recipeFixture(),{...empty,avoidedIngredientIds:["test-ingredient"]})).toMatchObject({reason:"safety_excluded"});
  expect(eligibility(recipeFixture(1,"published",{restrictionIds:["test-restriction"]}),{...empty,restrictionIds:["test-restriction"]})).toMatchObject({reason:"safety_excluded"});
 });
 it("uses only explicit equipment availability and reviewed alternatives",()=>{
  expect(eligibility(recipeFixture(),{...empty,equipment:{status:"known",availableIds:[]}})).toMatchObject({reason:"equipment_excluded"});
  expect(eligibility(recipeFixture(),{...empty,equipment:{status:"known",availableIds:["reviewed-pot-alternative"]}},{pot:["reviewed-pot-alternative"]})).toEqual({eligible:true});
 });
 it("excludes unknown/excess total time for a hard limit, keeps the exact boundary",()=>{
  expect(eligibility(recipeFixture(),{...empty,maxMinutes:"15"})).toEqual({eligible:true});
  expect(eligibility(recipeFixture(),{...empty,maxMinutes:"14.99"})).toMatchObject({reason:"time_excluded"});
  expect(eligibility(recipeFixture(1,"published",{cookMinutes:null,totalMinutes:null}),{...empty,maxMinutes:"100"})).toMatchObject({reason:"time_excluded"});
  expect(()=>eligibility(recipeFixture(),{...empty,maxMinutes:"0"})).toThrow("INVALID_HARD_TIME");
 });
 it("blocks all fresh results when safety conflicts remain",()=>{
  expect(()=>filterEligible([],{...empty,safetyConflict:true})).toThrow("SAFETY_CONFLICT");
 });
 it("rejects invalid published payloads even if review labels were supplied",()=>{
  const original=recipeFixture();
  for(const overrides of [{totalMinutes:"1"},{steps:[]},{ingredients:[{...original.version.ingredients[0]!,amount:{kind:"unknown" as const}}]}])expect(eligibility(recipeFixture(1,"published",overrides),empty)).toMatchObject({reason:"invalid_content"});
 });
 it("compares serving numbers numerically, without inferring or multiplying quantities",()=>{
  const original=recipeFixture();const candidate=recipeFixture(1,"published",{servingOptions:original.version.servingOptions.map(o=>({...o,servings:o.servings==="1"?"1.0":o.servings}))});
  expect(eligibility(candidate,empty)).toEqual({eligible:true});expect(candidate.version.servingOptions[1]?.ingredientQuantities[0]?.quantity).toBe("180");
 });
});
