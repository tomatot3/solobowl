import {z} from "zod";
import {accountRequest} from "@/server/sync/http";
import {createTaskService} from "@/server/tasks/service";
import {kitchenCommand} from "@/domain/tasks/commands";
import {shoppingRows} from "@/domain/shopping/aggregate";
import {ApiError,success} from "@/server/http/envelope";

const select=z.object({baseRevision:z.number().int().nonnegative().default(0),selectedTaskIds:z.array(z.uuid()).max(100)}).strict();
async function handle(request:Request,{params}:{params:Promise<{path?:string[]}>}){
 const path=(await params).path??[];
 return accountRequest(request,async ({id,pool,secret,readBody})=>{
   const tasks=createTaskService(pool,secret);
   if(path[0]!==undefined&&path[0]!=="current")throw new ApiError("RESOURCE_NOT_FOUND");
   if(request.method==="GET"&&path.length<=1){
     const workspace=await tasks.list(id);
     return success({id:"current",...workspace.shopping,items:shoppingRows(workspace)});
   }
   const operation=z.uuid().parse(request.headers.get("idempotency-key"));
   const raw=await readBody();
   let command:unknown;
   if(request.method==="POST"&&path.length===0||request.method==="PATCH"&&path.length===1){
     const input=select.parse(raw);
     command={kind:"select",revision:input.baseRevision,selected:input.selectedTaskIds};
   }else if(request.method==="PATCH"&&path.length===3&&path[1]==="items"){
     const input=z.object({baseRevision:z.number().int().nonnegative(),quantity:z.string().nullable().optional(),purchased:z.boolean().optional()}).strict().parse(raw);
     command={kind:"edit",revision:input.baseRevision,rowId:path[2],quantity:input.quantity,purchased:input.purchased};
   }else throw new ApiError("RESOURCE_NOT_FOUND");
   const {workspace}=await tasks.apply(id,operation,kitchenCommand.parse(command));
   return success({id:"current",...workspace.shopping,items:shoppingRows(workspace)});
 });
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
