import {expect,it} from "vitest";
import {recipeFixture} from "../fixtures/recipes";
import {labelPoints,scoreWithPreferences,timePoints} from "../../src/domain/recommendations/preference-scoring";

it("uses exact time and tag scoring and normalizes B over only selected dimensions",()=>{
  expect([20,30,45,60].map(total=>timePoints(30,String(total)).toNumber())).toEqual([100,100,50,0]);
  expect(timePoints(30,null).toNumber()).toBe(0);
  expect(labelPoints(["a","b","c","a"],["a","b","a"])?.toFixed(5)).toBe("66.66667");
  const candidate=recipeFixture(1,"published",{tags:["flavor:a","flavor:b","flavor:c","flavor:d"]});
  const result=scoreWithPreferences(candidate,"lidong",{flavorIds:["a","b","c","d","e"]});
  expect(result.mode).toBe("B");
  expect(result.factors.denominator).toBe(55);
  expect(result.score.toFixed(6)).toBe("90.909091");
  expect(scoreWithPreferences(candidate,"lidong",{}).mode).toBe("A");
});

it("scores C from deduplicated soft conditions and does not score hard limits against other conditions",()=>{
  const candidate=recipeFixture(1,"published",{tags:["flavor:a"]});
  const result=scoreWithPreferences(candidate,"lidong",undefined,{dishName:"TEST",flavorIds:["a","missing","a"],maxMinutes:20});
  expect(result.mode).toBe("C");
  expect(result.factors.denominator).toBe(75);
  expect("demand" in result.factors&&Number(result.factors.demand)).toBeCloseTo(200/3);
});
