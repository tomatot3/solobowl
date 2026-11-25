import {z} from "zod";
import type {ContentPort} from "../../domain/shared/ports";
import {filterEligible,type EligibilityContext} from "../../domain/recommendations/eligibility";
import {recipeMatchesText} from "../../domain/recommendations/meal-request";
import {ApiError} from "../http/envelope";

export const recipeFilters=z.object({
  q:z.string().trim().min(1).max(48).optional(),
  ingredient:z.string().trim().min(1).max(48).optional(),
  ingredientIds:z.array(z.string().min(1).max(100)).max(20).optional(),
  difficulty:z.string().trim().min(1).max(48).optional(),
  maxMinutes:z.number().int().min(1).max(1440).optional(),
  limit:z.number().int().min(1).max(50).default(20),
  cursor:z.string().regex(/^p[1-9]\d{0,5}$/).optional(),
}).strict();

export async function findRecipes(content:ContentPort,context:EligibilityContext,filters:z.output<typeof recipeFilters>){
  if(context.safetyConflict)throw new ApiError("SAFETY_CONFLICT");
  const base=filterEligible(await content.listCurrentWinter(),context).eligible;
  const difficulties=[...new Set(base.flatMap(item=>item.version.difficulty?[item.version.difficulty]:[]))].sort();
  const rows=filterEligible(base,{...context,maxMinutes:filters.maxMinutes===undefined?context.maxMinutes:String(filters.maxMinutes)}).eligible
    .filter(({version:v})=>{
      const matchIngredient=(query:string)=>v.ingredients.some(line=>recipeMatchesText(line.rawName,query));
      return (!filters.q||recipeMatchesText(v.name,filters.q)||matchIngredient(filters.q))
        && (!filters.ingredient||matchIngredient(filters.ingredient))
        && (!filters.difficulty||v.difficulty===filters.difficulty)
        && (!filters.ingredientIds||filters.ingredientIds.every(id=>v.ingredients.some(line=>line.ingredientId===id)));
    })
    .sort((a,b)=>a.recipe.id<b.recipe.id?-1:a.recipe.id>b.recipe.id?1:0);
  const offset=filters.cursor?Number(filters.cursor.slice(1)):0;
  if(filters.cursor&&offset>=rows.length)throw new ApiError("INVALID_INPUT");
  const end=offset+filters.limit;
  return {difficulties,nextCursor:end<rows.length?"p"+end:null,items:rows.slice(offset,end).map(({recipe,version})=>({
    recipeId:recipe.id,versionId:version.id,name:version.name,image:version.image,totalMinutes:version.totalMinutes,difficulty:version.difficulty,
  }))};
}
