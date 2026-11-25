import {getDatabasePool} from "@/server/db/connection";
import {createRecipeRepository} from "@/server/recipes/repository";
import {entityId} from "@/domain/shared/validation";
import {ApiError,handleApi} from "@/server/http/envelope";
import {assertSafeWrite,assertJsonMutation} from "@/server/http/access";
import {readConfig} from "@/server/config";
import {checkAvailability} from "@/server/recipes/availability";
import {resolveAccess} from "@/server/recommendations/context";
import {effectiveEligibility,guestSchema} from "@/server/recommendations/service";
import {z} from "zod";
const schema=z.object({action:z.enum(["create","start","resume","step"]),servingOptionId:z.string().uuid(),knownLifecycleRevision:z.number().int().nonnegative().optional(),guestContext:guestSchema.optional()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{versionId:string}>}){
 return handleApi(async()=>{
  assertSafeWrite(request,readConfig().APP_BASE_URL);assertJsonMutation(request);
  let raw:unknown;try{raw=await request.json();}catch{throw new ApiError("INVALID_INPUT");}const input=schema.safeParse(raw);if(!input.success)throw new ApiError("INVALID_INPUT");
  const context=effectiveEligibility(await resolveAccess(request),input.data.guestContext);
  if(context.safetyConflict)throw new ApiError("SAFETY_CONFLICT");
  let id;try{id=entityId((await params).versionId);}catch{throw new ApiError("INVALID_INPUT");}
  const candidate=await createRecipeRepository(getDatabasePool()).getVersion(id);if(!candidate)throw new ApiError("RESOURCE_NOT_FOUND");
  return checkAvailability(candidate,input.data.action,input.data.servingOptionId,new Date(),context);
 });
}
