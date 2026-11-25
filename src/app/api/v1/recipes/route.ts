import {recipeAccess} from "@/server/recommendations/context";
import {createRecipeRepository} from "@/server/recipes/repository";
import {findRecipes,recipeFilters} from "@/server/recipes/query";
import {getDatabasePool} from "@/server/db/connection";
import {ApiError,handleApi} from "@/server/http/envelope";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  return handleApi(async()=>{
    const query=new URL(request.url).searchParams;
    const input:Record<string,unknown>={};
    for(const [key,value] of query){
      if(key==="ingredientIds"){
        input[key]=[...((input[key] as string[]|undefined)??[]),value];
      }else{
        if(Object.hasOwn(input,key)||!["q","ingredient","difficulty","maxMinutes","limit","cursor"].includes(key))throw new ApiError("INVALID_INPUT");
        input[key]=["maxMinutes","limit"].includes(key)?Number(value):value;
      }
    }
    const parsed=recipeFilters.safeParse(input);
    if(!parsed.success)throw new ApiError("INVALID_INPUT");
    return findRecipes(createRecipeRepository(getDatabasePool()),await recipeAccess(request),parsed.data);
  });
}
