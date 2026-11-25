import {z} from "zod";
import {kitchenCommand} from "@/domain/tasks/commands";
import {accountRequest} from "@/server/sync/http";
import {createTaskService} from "@/server/tasks/service";
import {ApiError,parsePagination,success} from "@/server/http/envelope";

export const dynamic="force-dynamic";
export async function GET(request:Request){
  return accountRequest(request,async ({id,pool,secret})=>{
    const workspace=await createTaskService(pool,secret).list(id);
    const params=new URL(request.url).searchParams;
    if(!params.size)return success(workspace);
    const state=z.enum(["todo","cooking","completed","cancelled"]).optional().parse(params.get("state")??undefined);
    const {limit,cursor}=parsePagination(params);
    const matches=workspace.tasks.filter(task=>!state||task.state===state);
    const offset=cursor?matches.findIndex(task=>task.id===cursor)+1:0;
    if(cursor&&offset===0)throw new ApiError("RESOURCE_NOT_FOUND");
    const tasks=matches.slice(offset,offset+limit);
    return success({...workspace,tasks,nextCursor:offset+limit<matches.length?tasks.at(-1)?.id:null});
  });
}
export async function POST(request:Request){
  return accountRequest(request,async ({id,pool,secret,readBody})=>{
    const operation=z.uuid().parse(request.headers.get("idempotency-key"));
    const raw=await readBody();
    const create=z.object({recipeId:z.uuid(),versionId:z.uuid(),servingOptionId:z.uuid()}).strict().safeParse(raw);
    const command=kitchenCommand.parse(create.success?{kind:"create",recipeId:create.data.recipeId,versionId:create.data.versionId,optionId:create.data.servingOptionId}:raw);
    const result=await createTaskService(pool,secret).apply(id,operation,command);
    return success(result,undefined,command.kind==="create"&&!result.existingTask?201:200);
  });
}
