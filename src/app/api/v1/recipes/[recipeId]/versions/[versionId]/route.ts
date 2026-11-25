import {getDatabasePool} from "@/server/db/connection";
import {createRecipeRepository} from "@/server/recipes/repository";
import {entityId} from "@/domain/shared/validation";
import {ApiError,handleApi} from "@/server/http/envelope";
import {recipeAccess} from "@/server/recommendations/context";
import {safetyExclusion} from "@/domain/recommendations/eligibility";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{recipeId:string;versionId:string}>}){
 return handleApi(async()=>{
  const context=await recipeAccess(request);const {recipeId,versionId}=await params;let id;try{id=entityId(versionId);entityId(recipeId);}catch{throw new ApiError("INVALID_INPUT");}
  const candidate=await createRecipeRepository(getDatabasePool()).getVersion(id);
  if(!candidate||candidate.recipe.id!==recipeId||candidate.version.season!=="winter"||!["published","archived","safety_withdrawn"].includes(candidate.lifecycle.state))throw new ApiError("RESOURCE_NOT_FOUND");
  if(safetyExclusion(candidate.version,context)) throw new ApiError("RESOURCE_NOT_FOUND");
  return candidate;
 });
}
