import {randomUUID} from "node:crypto";
import {z} from "zod";
import {accountRequest} from "@/server/sync/http";
import {createSyncService,operationInput} from "@/server/sync/service";
import {ApiError,failure,success} from "@/server/http/envelope";
import {systemClock} from "@/domain/calendar/clock";

const revision=z.object({baseRevision:z.number().int().nonnegative(),deletionGeneration:z.number().int().nonnegative().default(0)});
const save=revision.extend({businessDate:z.string(),text:z.string().max(2000)}).strict();

async function handler(request:Request){
  return accountRequest(request,async ({id,pool,secret,readBody})=>{
    const sync=createSyncService(pool,secret);
    if(request.method==="GET")return success((await sync.bootstrap(id)).today);
    const remove=request.method==="DELETE";
    const body=await readBody();
    const values=remove ? {...revision.strict().parse(body),businessDate:systemClock.businessDate(),text:""} : save.parse(body);
    const operation=operationInput.parse({
      operationId:request.headers.get("idempotency-key")??randomUUID(),entityType:"today_state",
      entityId:values.businessDate,action:remove?"delete":"save",baseRevision:values.baseRevision,
      deletionGeneration:values.deletionGeneration,patch:remove?{}:{text:values.text},
    });
    const result=(await sync.mutations(id,[operation]))[0]!;
    if(result.status!=="ack"){
      const code="code" in result ? result.code : "REVISION_CONFLICT";
      if(code==="EXPIRED_STATE"||code==="REVISION_CONFLICT"||code==="IDEMPOTENCY_CONFLICT")return failure(new ApiError(code));
      return failure(new ApiError("INVALID_INPUT"));
    }
    return success(remove?{deleted:true}:(await sync.bootstrap(id)).today);
  });
}
export const GET=handler;
export const PUT=handler;
export const DELETE=handler;
