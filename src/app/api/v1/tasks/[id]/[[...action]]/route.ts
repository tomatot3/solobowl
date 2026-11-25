import {z} from "zod";
import {accountRequest} from "@/server/sync/http";
import {createTaskService} from "@/server/tasks/service";
import {createRecipeRepository} from "@/server/recipes/repository";
import {kitchenCommand} from "@/domain/tasks/commands";
import {entityId} from "@/domain/shared/validation";
import {ApiError,success} from "@/server/http/envelope";

const revision={baseRevision:z.number().int().min(1)};
const actions={start:"start",resume:"resume",confirm_step:"next",go_previous:"previous",cancel:"cancel",complete:"complete"} as const;
async function handle(request:Request,{params}:{params:Promise<{id:string;action?:string[]}>}){
 const path=await params;
 return accountRequest(request,async ({id,pool,secret,readBody})=>{
   const taskId=entityId(z.uuid().parse(path.id));
   const action=path.action?.join("/")??"";
   const tasks=createTaskService(pool,secret);
   if(request.method==="GET"&&!action){
     const workspace=await tasks.list(id);
     const task=workspace.tasks.find(item=>item.id===taskId);
     if(!task)throw new ApiError("RESOURCE_NOT_FOUND");
     const current=await createRecipeRepository(pool).getVersion(task.snapshot.id);
     return success({task,lifecycle:current?.lifecycle??null});
   }
   const operation=z.uuid().parse(request.headers.get("idempotency-key"));
   const raw=await readBody();
   let command:unknown;
   if(request.method==="PATCH"&&action==="serving"){
     const input=z.object({...revision,optionId:z.uuid()}).strict().parse(raw);
     command={kind:"serving",id:taskId,revision:input.baseRevision,optionId:input.optionId};
   }else if(request.method==="POST"&&action==="actions"){
     const input=z.object({...revision,action:z.enum(["start","resume","confirm_step","go_previous","cancel","complete"]),stepId:z.uuid().optional()}).strict().parse(raw);
     command={kind:"task",id:taskId,revision:input.baseRevision,action:actions[input.action],stepId:input.stepId};
   }else if(request.method==="PUT"&&action==="timer"){
     const input=z.object({...revision,stepId:z.uuid(),durationSeconds:z.number().int().positive()}).strict().parse(raw);
     command={kind:"task",id:taskId,revision:input.baseRevision,action:"timer",stepId:input.stepId,durationSeconds:input.durationSeconds};
   }else if(request.method==="PUT"&&action==="feedback"){
     const input=z.object({...revision,taste:z.enum(["liked","neutral","disliked"]),portion:z.enum(["small","right","large"])}).strict().parse(raw);
     command={kind:"feedback",id:taskId,revision:input.baseRevision,feedback:{taste:input.taste,portion:input.portion}};
   }else if(request.method==="DELETE"&&!action){
     const input=z.object(revision).strict().parse(raw);
     command={kind:"task",id:taskId,revision:input.baseRevision,action:"cancel"};
   }else throw new ApiError("RESOURCE_NOT_FOUND");
   const result=await tasks.apply(id,operation,kitchenCommand.parse(command));
   return success({task:result.workspace.tasks.find(item=>item.id===taskId),shoppingRevision:result.workspace.shopping.revision});
 });
}
export const GET=handle;
export const DELETE=handle;
export const PATCH=handle;
export const POST=handle;
export const PUT=handle;
