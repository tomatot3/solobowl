import {Decimal} from "decimal.js";
import {describe,it,expect} from "vitest";
import {recipeFixture} from "../fixtures/recipes";
import {scoreSeasonal} from "../../src/domain/recommendations/scoring";
import {selectRecommendations,type ScoredCandidate} from "../../src/domain/recommendations/selection";
import {filterEligible} from "../../src/domain/recommendations/eligibility";
function scored(index:number,score:string,dishType="soup",totalMinutes:string|null="15",completeness="1"):ScoredCandidate{
 return {candidate:recipeFixture(index,"published",{dishType,totalMinutes,completeness}),score:new Decimal(score)};
}
describe("rule A and stable bounded diversity",()=>{
 it("uses 8300/85 and no 15 percent diversity scoring",()=>{
  const result=scoreSeasonal(recipeFixture(1,"published",{completeness:"0.8"}),"lidong");
  expect(result.mode).toBe("A");expect(result.score.toFixed(12)).toBe("97.647058823529");expect(result.factors).toEqual({term:100,season:100,completeness:"80",denominator:85});
  expect(scoreSeasonal(recipeFixture(2,"published",{termCodes:[]}),"lidong").score.toFixed(12)).toBe("70.588235294118");
 });
 it("returns 0/1/2/3 with exactly one primary when nonempty",()=>{
  for(const n of [0,1,2,4]){const selected=selectRecommendations(Array.from({length:n},(_,i)=>scored(i+1,"95")));expect(selected).toHaveLength(Math.min(n,3));expect(selected.filter(s=>s.role==="primary")).toHaveLength(n?1:0);}
 });
 it("keeps mode A when the only supplied information is a safety restriction",()=>{
  const safe=recipeFixture(1),unsafe=recipeFixture(2,"published",{allergenIds:["test-allergen"]});
  const result=filterEligible([safe,unsafe],{allergenIds:["test-allergen"],avoidedIngredientIds:[],restrictionIds:[],equipment:{status:"unknown"},maxMinutes:null,safetyConflict:false});
  expect(result.eligible).toHaveLength(1);expect(scoreSeasonal(result.eligible[0]!,"lidong").mode).toBe("A");
 });
 it("fixes the highest score and selects a new type at exactly five points",()=>{
  const result=selectRecommendations([scored(1,"100"),scored(2,"94"),scored(3,"89","vegetable"),scored(4,"88.999999","grain")]);
  expect(result.map(r=>r.candidate.recipe.sourceId)).toEqual(["TEST_ONLY_1","TEST_ONLY_3","TEST_ONLY_2"]);
 });
 it("does not round a gap above five into an eligible replacement",()=>{
  expect(selectRecommendations([scored(1,"100"),scored(2,"94"),scored(3,"88.999999","vegetable")])[1]?.candidate.recipe.sourceId).toBe("TEST_ONLY_2");
 });
 it("breaks ties by completeness, known duration then recipe identity",()=>{
  const ordered=selectRecommendations([scored(4,"90","soup",null),scored(3,"90","soup","15"),scored(2,"90","soup","15"),scored(1,"90","soup","20","0.9")]);
  expect(ordered.map(r=>r.candidate.recipe.sourceId)).toEqual(["TEST_ONLY_2","TEST_ONLY_3","TEST_ONLY_4"]);
 });
});
