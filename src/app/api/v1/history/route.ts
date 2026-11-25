import {accountRequest} from "@/server/sync/http";
import {createTaskService} from "@/server/tasks/service";
import {parsePagination,success,ApiError} from "@/server/http/envelope";
export async function GET(request:Request){
 return accountRequest(request,async ({id,pool,secret})=>{
   const workspace=await createTaskService(pool,secret).list(id);
   const {limit,cursor}=parsePagination(new URL(request.url).searchParams);
   const completed=workspace.tasks.filter(item=>item.state==="completed").sort((a,b)=>(b.completedAt??"").localeCompare(a.completedAt??"")||a.id.localeCompare(b.id));
   const first=cursor?completed.findIndex(item=>item.id===cursor)+1:0;
   if(cursor&&first===0)throw new ApiError("RESOURCE_NOT_FOUND");
   const items=completed.slice(first,first+limit);
   return success({items,nextCursor:first+limit<completed.length?items.at(-1)?.id:null});
 });
}
