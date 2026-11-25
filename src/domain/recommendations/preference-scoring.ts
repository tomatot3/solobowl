import {Decimal} from "decimal.js";
import type {WinterTerm} from "../recipes/types";
import type {RecipeCandidate} from "./eligibility";
import {recipeMatchesText,type MealRequest} from "./meal-request";
import {scoreSeasonal} from "./scoring";

const Score=Decimal.clone({precision:40});
export type OrdinaryPreferences={
  preferredMinutes?:number; flavorIds?:readonly string[]; difficulty?:string;
  dietaryIds?:readonly string[]; regionIds?:readonly string[];
};

export function timePoints(preference:number,total:string|null) {
  if(!Number.isFinite(preference)||preference<=0)throw new Error("INVALID_TIME_PREFERENCE");
  if(total===null)return new Score(0);
  const ratio=new Score(total).div(preference);
  if(!ratio.isFinite()||ratio.lt(0))throw new Error("INVALID_RECIPE_TIME");
  if(ratio.lte(1))return new Score(100);
  return new Score(2).minus(ratio).times(100).clamp(0,100);
}

export function labelPoints(requested:readonly string[]|undefined,existing:readonly string[]) {
  const selected=[...new Set(requested??[])];
  if(!selected.length)return undefined;
  const actual=new Set(existing);
  return new Score(selected.filter(value=>actual.has(value)).length).times(100).div(selected.length);
}

function tags(candidate:RecipeCandidate,group:string) {
  const prefix=group+":";
  return candidate.version.tags.filter(tag=>tag.startsWith(prefix)).map(tag=>tag.slice(prefix.length));
}

export function scoreWithPreferences(candidate:RecipeCandidate, term:WinterTerm, prefs?:OrdinaryPreferences, meal?:MealRequest) {
  const seasonal=scoreSeasonal(candidate,term);
  const content=candidate.version;
  const flavor=labelPoints(meal?.flavorIds??prefs?.flavorIds,tags(candidate,"flavor"));
  const dietary=labelPoints(prefs?.dietaryIds,tags(candidate,"dietary"));
  const region=labelPoints(prefs?.regionIds,tags(candidate,"region"));
  const preferred=meal?.preferredMinutes??prefs?.preferredMinutes;
  const time=preferred===undefined?undefined:timePoints(preferred,content.totalMinutes);
  const requestedDifficulty=meal?.difficulty??prefs?.difficulty;
  const difficulty=requestedDifficulty?new Score(requestedDifficulty===content.difficulty?100:0):undefined;
  const base=seasonal.factors;
  const weights:{key:string;weight:number;points:Decimal}[]=[];
  function add(key:string,weight:number,points:Decimal|number|string|undefined) {
    if(points!==undefined)weights.push({key,weight,points:new Score(points)});
  }
  if(meal) {
    const ingredientIds=content.ingredients.flatMap(line=>line.ingredientId?[line.ingredientId]:[]);
    const ingredients=labelPoints(meal.ingredientIds,ingredientIds);
    const requirements:boolean[]=[];
    if(meal.dishName)requirements.push(recipeMatchesText(content.name,meal.dishName));
    if(meal.ingredientName)requirements.push(content.ingredients.some(line=>recipeMatchesText(line.rawName,meal.ingredientName!)));
    for(const label of new Set(meal.flavorIds))requirements.push(tags(candidate,"flavor").includes(label));
    if(time&&meal.preferredMinutes!==undefined)requirements.push(time.eq(100));
    for(const id of new Set(meal.ingredientIds))requirements.push(ingredientIds.includes(id));
    if(difficulty&&meal.difficulty)requirements.push(difficulty.eq(100));
    // Hard-only requests give every surviving candidate the same demand points.
    const demand=requirements.length?new Score(requirements.filter(Boolean).length).times(100).div(requirements.length):new Score(100);
    add("demand",35,demand);
    add("term",20,base.term);
    add("completeness",5,base.completeness);
    add("flavor",15,flavor);
    add("time",10,time);
    add("ingredients",10,ingredients);
    add("difficulty",5,difficulty);
  } else {
    if([flavor,time,difficulty,dietary,region].every(value=>value===undefined))return seasonal;
    add("flavor",25,flavor);
    add("term",20,base.term);
    add("time",15,time);
    add("difficulty",10,difficulty);
    add("dietary",10,dietary);
    add("region",10,region);
    add("completeness",10,base.completeness);
  }
  const denominator=weights.reduce((sum,item)=>sum+item.weight,0);
  const score=weights.reduce((sum,item)=>sum.plus(item.points.times(item.weight)),new Score(0)).div(denominator);
  const factors:Record<string,string|number>&{term:number;denominator:number}={
    ...Object.fromEntries(weights.map(item=>[item.key,item.points.toString()])),term:base.term,denominator,
  };
  return {candidate,mode:meal?"C" as const:"B" as const,score,factors};
}
