import {randomUUID} from "node:crypto";
import type pg from "pg";
import type {AccountId} from "../../domain/shared/types";
import {entityId} from "../../domain/shared/validation";
import {activeTask,emptyWorkspace,getServing,makeTask,type CookingTask,type KitchenWorkspace} from "../../domain/tasks/model";
import {updateWorkspace,type KitchenCommand} from "../../domain/tasks/commands";
import {requiresAvailability,stepDuration} from "../../domain/cooking/progress";
import {ApiError} from "../http/envelope";
import {withTransaction} from "../db/pool";
import {lockAccount,requestHash} from "../sync/service";
import {createRecipeRepository} from "../recipes/repository";
import {accountRecommendationContext} from "../recommendations/account-settings";
import {checkAvailability} from "../recipes/availability";

function domainError(error:unknown):never{
  const code=error instanceof Error?error.message:"";
  if(code==="REVISION_CONFLICT"||code==="RESOURCE_NOT_FOUND"||code==="INVALID_INPUT")throw new ApiError(code);
  throw error;
}

export function createTaskService(pool:pg.Pool,secret:string,transaction?:pg.PoolClient){
  const transact=<T>(work:(client:pg.PoolClient)=>Promise<T>)=>transaction?work(transaction):withTransaction(pool,work);
  async function read(client:pg.PoolClient,id:AccountId):Promise<KitchenWorkspace>{
    const workspace=emptyWorkspace();
    workspace.tasks=(await client.query<{task:CookingTask}>("SELECT task FROM cooking_task WHERE account_id=$1 ORDER BY task->>'createdAt' DESC",[id])).rows.map(row=>row.task);
    workspace.shopping=(await client.query<{shopping:KitchenWorkspace["shopping"]}>("SELECT shopping FROM shopping_workspace WHERE account_id=$1",[id])).rows[0]?.shopping??workspace.shopping;
    return workspace;
  }
  async function verify(client:pg.PoolClient,id:AccountId,recipeId:string,versionId:string,optionId:string,action:"create"|"resume",now:Date){
    await client.query("SELECT id FROM recipe WHERE id=$1 FOR SHARE",[recipeId]);
    await client.query("SELECT version_id FROM recipe_lifecycle WHERE version_id=$1 FOR SHARE",[versionId]);
    const candidate=await createRecipeRepository(pool,client).getVersion(entityId(versionId));
    if(!candidate||candidate.recipe.id!==recipeId)throw new ApiError("RESOURCE_NOT_FOUND");
    const {context}=await accountRecommendationContext(pool,id,client);
    if(context.safetyConflict)throw new ApiError("SAFETY_CONFLICT");
    if(candidate.lifecycle.state==="safety_withdrawn")throw new ApiError("SAFETY_WITHDRAWN");
    if(!checkAvailability(candidate,action,optionId,now,context).allowed)throw new ApiError("RECIPE_UNAVAILABLE");
    return candidate;
  }
  return {
    list:(id:AccountId)=>transact(async client=>{await lockAccount(client,id);return read(client,id);}),
    apply:(id:AccountId,operation:string,input:KitchenCommand)=>transact(async client=>{
      await lockAccount(client,id);
      const workspace=await read(client,id);
      const hash=requestHash(secret,input);
      const previous=(await client.query<{request_hash:string;task_id:string|null}>("SELECT request_hash,task_id FROM cooking_operation WHERE account_id=$1 AND id=$2",[id,operation])).rows[0];
      if(previous){
        if(previous.request_hash!==hash)throw new ApiError("IDEMPOTENCY_CONFLICT");
        return {workspace,taskId:previous.task_id,existingTask:true};
      }
      const now=new Date();
      let next=workspace;
      let taskId:string|null=null;
      let existingTask=false;
      if(input.kind==="create"){
        const existing=workspace.tasks.find(task=>task.snapshot.id===input.versionId&&activeTask(task));
        if(existing){taskId=existing.id;existingTask=true;}
        else{
          const candidate=await verify(client,id,input.recipeId,input.versionId,input.optionId,"create",now);
          const task=makeTask(entityId(randomUUID()),candidate.version,entityId(input.optionId),now.toISOString());
          taskId=task.id;
          next={...workspace,tasks:[task,...workspace.tasks]};
        }
      }else{
        if("id" in input){
          const task=workspace.tasks.find(task=>task.id===input.id);
          if(!task)throw new ApiError("RESOURCE_NOT_FOUND");
          taskId=task.id;
          if(input.kind==="task"&&requiresAvailability(input.action)&&!(input.action==="complete"&&task.state==="completed")){
            if(input.stepId&&task.snapshot.steps[task.step]?.id!==input.stepId)throw new ApiError("REVISION_CONFLICT");
            if(input.durationSeconds!==undefined&&(input.action!=="timer"||stepDuration(task)!==input.durationSeconds))throw new ApiError("INVALID_INPUT");
            await verify(client,id,task.snapshot.recipeId,task.snapshot.id,getServing(task).id,"resume",now);
          }
        }
        try{next=updateWorkspace(workspace,input,now);}catch(error){domainError(error);}
      }
      for(const task of next.tasks){
        if(workspace.tasks.some(old=>old===task))continue;
        await client.query(`INSERT INTO cooking_task(account_id,id,version_id,state,revision,task) VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,task=EXCLUDED.task
          WHERE cooking_task.account_id=EXCLUDED.account_id`,[id,task.id,task.snapshot.id,task.state,task.revision,task]);
        await client.query("INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind) VALUES($1,'task',$2,$3,'upsert')",[id,task.id,task.revision]);
      }
      if(next.shopping!==workspace.shopping){
        await client.query(`INSERT INTO shopping_workspace(account_id,shopping) VALUES($1,$2)
          ON CONFLICT(account_id) DO UPDATE SET shopping=EXCLUDED.shopping`,[id,next.shopping]);
        await client.query("INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind) VALUES($1,'shopping','current',$2,'upsert')",[id,next.shopping.revision]);
      }
      await client.query("INSERT INTO cooking_operation(account_id,id,request_hash,task_id) VALUES($1,$2,$3,$4)",[id,operation,hash,taskId]);
      return {workspace:next,taskId,existingTask};
    }),
  };
}
