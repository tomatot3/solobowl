import {z} from "zod";
import {ApiError,success} from "@/server/http/envelope";
import {accountRequest} from "@/server/sync/http";
import {createMergeService,mergeInput,resolveInput} from "@/server/merge/service";
export const dynamic="force-dynamic";
async function handle(request:Request,{params}:{params:Promise<{path?:string[]}>}){
  const path=(await params).path??[];
  return accountRequest(request,async ({id,secret,pool,readBody})=>{
    const merges=createMergeService(pool,secret);
    if (!path.length && request.method==="POST") return success(await merges.start(id,mergeInput.parse(await readBody())));
    if (!path.length && request.method==="GET") return success(await merges.pending(id));
    const mergeId=z.uuid().parse(path[0]);
    if (path.length===1 && request.method==="GET") return success(await merges.read(id,mergeId));
    if (path.length===1 && request.method==="DELETE") return success(await merges.cancel(id,mergeId));
    if (path.length===2 && path[1]==="resolve" && request.method==="POST") return success(await merges.resolve(id,mergeId,resolveInput.parse(await readBody())));
    throw new ApiError("RESOURCE_NOT_FOUND");
  });
}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
