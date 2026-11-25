import {z} from "zod";
import {entityId} from "@/domain/shared/validation";
import {accountRequest} from "@/server/sync/http";
import {ApiError,success} from "@/server/http/envelope";
import {createFavoriteService} from "@/server/favorites/service";
export const dynamic="force-dynamic";

async function handler(request:Request,{params}:{params:Promise<{path?:string[]}>}){
  const path=(await params).path??[];
  return accountRequest(request,async ({id,pool,readBody})=>{
    const favorites=createFavoriteService(pool);
    if(!path.length&&request.method==="GET")return success(await favorites.list(id));
    if(path.length!==1)throw new ApiError("RESOURCE_NOT_FOUND");
    const recipeId=entityId(z.uuid().parse(path[0]));
    const input=z.object({versionId:z.uuid().optional(),baseRevision:z.number().int().nonnegative().optional(),deletionGeneration:z.number().int().nonnegative().optional()}).strict().parse(await readBody());
    const saved=request.method==="PUT";
    if(saved&&!input.versionId)throw new ApiError("INVALID_INPUT");
    return success(await favorites.change(id,recipeId,{...input,saved,versionId:input.versionId?entityId(input.versionId):undefined}));
  });
}
export const GET=handler;
export const PUT=handler;
export const DELETE=handler;
