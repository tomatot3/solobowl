import {z} from "zod";
import {ApiError,success} from "@/server/http/envelope";
import {accountRequest} from "@/server/sync/http";
import {createSyncService,operationInput} from "@/server/sync/service";
export const dynamic="force-dynamic";
async function handle(request: Request,{params}:{params:Promise<{path:string[]}>}) {
  const parts=(await params).path;
  const path=parts.join("/");
  return accountRequest(request,async ({id,pool,secret,readBody})=>{
    const sync=createSyncService(pool,secret);
    if (request.method==="GET" && path==="bootstrap") return success(await sync.bootstrap(id));
    if (request.method==="GET" && path==="changes") {
      const query=new URL(request.url).searchParams;
      const cursor=z.string().min(1).max(100).parse(query.get("cursor"));
      const limit=z.coerce.number().int().min(1).max(100).parse(query.get("limit")??100);
      return success(await sync.changes(id,cursor,limit));
    }
    if (request.method==="POST" && path==="mutations") {
      const {operations}=z.object({operations:z.array(operationInput).min(1).max(50)}).strict().parse(await readBody());
      return success({results:await sync.mutations(id,operations)});
    }
    if(parts[0]==="conflicts"&&parts[1]){
      const conflictId=z.uuid().parse(parts[1]);
      if(request.method==="GET"&&parts.length===2)return success(await sync.conflict(id,conflictId));
      if(request.method==="POST"&&parts.length===3&&parts[2]==="resolve"){
        const input=z.object({choice:z.enum(["device","account"]),baseRevision:z.number().int().nonnegative(),operationId:z.uuid()}).strict().parse(await readBody());
        return success(await sync.resolve(id,conflictId,input));
      }
    }
    throw new ApiError("RESOURCE_NOT_FOUND");
  });
}
export const GET=handle;
export const POST=handle;
