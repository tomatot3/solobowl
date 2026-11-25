import {z} from "zod";
import {readConfig} from "@/server/config";
import {getDatabasePool} from "@/server/db/connection";
import {assertJsonMutation,assertSafeWrite} from "@/server/http/access";
import {ApiError,handleApi} from "@/server/http/envelope";
import {resolveAccess} from "@/server/recommendations/context";
import {effectiveEligibility,guestSchema} from "@/server/recommendations/service";
import {createRecipeRepository} from "@/server/recipes/repository";
import {findRecipes,recipeFilters} from "@/server/recipes/query";

const body=z.object({filters:recipeFilters,guestContext:guestSchema.optional()}).strict();
export async function POST(request:Request){
  return handleApi(async()=>{
    assertSafeWrite(request,readConfig().APP_BASE_URL);
    assertJsonMutation(request);
    const raw=await request.text();
    if(raw.length>16384)throw new ApiError("INVALID_INPUT");
    let value:unknown;
    try{value=JSON.parse(raw);}catch{throw new ApiError("INVALID_INPUT");}
    const parsed=body.safeParse(value);
    if(!parsed.success)throw new ApiError("INVALID_INPUT");
    const context=effectiveEligibility(await resolveAccess(request),parsed.data.guestContext);
    return findRecipes(createRecipeRepository(getDatabasePool()),context,parsed.data.filters);
  });
}
