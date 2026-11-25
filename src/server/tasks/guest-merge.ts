import {randomUUID} from "node:crypto";
import type pg from "pg";
import type {AccountId} from "../../domain/shared/types";
import {entityId} from "../../domain/shared/validation";
import {activeTask,emptyWorkspace,getServing,makeTask,type CookingTask,type KitchenWorkspace} from "../../domain/tasks/model";
import {stepDuration} from "../../domain/cooking/progress";
import {shoppingRows} from "../../domain/shopping/aggregate";
import type {CookingTransfer,GuestTask} from "../../domain/tasks/guest-transfer";
import {accountRecommendationContext} from "../recommendations/account-settings";
import {createRecipeRepository} from "../recipes/repository";
import {checkAvailability} from "../recipes/availability";
import {ApiError} from "../http/envelope";

export function taskLabel(task:CookingTask|undefined){
  return task?{name:task.snapshot.name,state:task.state,step:task.step+1,servings:getServing(task).servings,revision:task.revision}:null;
}
export async function readMergeTasks(client:pg.PoolClient,id:AccountId){
  return (await client.query<{task:CookingTask}>("SELECT task FROM cooking_task WHERE account_id=$1",[id])).rows.map(row=>row.task);
}
export async function mergeGuestTask(pool:pg.Pool,client:pg.PoolClient,account:AccountId,source:GuestTask,
  choice?:{mode:"guest"|"account";expectedId:string;revision:number}){
  const mapped=(await client.query<{task_id:string}>("SELECT task_id FROM guest_task_map WHERE account_id=$1 AND guest_task_id=$2",[account,source.sourceId])).rows[0];
  if(mapped)return {taskId:mapped.task_id};
  const existing=(await readMergeTasks(client,account)).find(task=>activeTask(task)&&task.snapshot.id===source.versionId);
  if(choice&&(!existing||existing.id!==choice.expectedId||existing.revision!==choice.revision))throw new ApiError("REVISION_CONFLICT");
  async function mapping(taskId:string){
    await client.query("INSERT INTO guest_task_map(account_id,guest_task_id,task_id) VALUES($1,$2,$3)",[account,source.sourceId,taskId]);
    return {taskId};
  }
  if(choice?.mode==="account"&&existing)return mapping(existing.id);
  const now=new Date();
  await client.query("SELECT id FROM recipe WHERE id=$1 FOR SHARE",[source.recipeId]);
  await client.query("SELECT version_id FROM recipe_lifecycle WHERE version_id=$1 FOR SHARE",[source.versionId]);
  const candidate=await createRecipeRepository(pool,client).getVersion(entityId(source.versionId));
  if(!candidate||candidate.recipe.id!==source.recipeId||candidate.version.contentHash!==source.contentHash||candidate.version.season!=="winter")throw new ApiError("RECIPE_UNAVAILABLE");
  if(source.step>=candidate.version.steps.length||!candidate.version.servingOptions.some(option=>option.id===source.optionId&&option.reviewRef))throw new ApiError("INVALID_INPUT");
  if(source.state!=="completed"){
    const {context}=await accountRecommendationContext(pool,account,client);
    if(context.safetyConflict)throw new ApiError("SAFETY_CONFLICT");
    if(!checkAvailability(candidate,"resume",source.optionId,now,context).allowed)throw new ApiError("RECIPE_UNAVAILABLE");
  }else if(!["published","archived","safety_withdrawn"].includes(candidate.lifecycle.state))throw new ApiError("RECIPE_UNAVAILABLE");
  const created=Date.parse(source.createdAt);
  const finished=source.completedAt?Date.parse(source.completedAt):null;
  if(created>now.getTime()+60000||((source.state==="completed")!==(finished!==null))||
    (finished!==null&&(finished<created||finished>now.getTime()+60000))||(source.state==="todo"&&source.step!==0)||
    (source.state==="completed"&&source.step!==candidate.version.steps.length-1))throw new ApiError("INVALID_INPUT");
  const targetId=choice?.mode==="guest"&&existing?existing.id:entityId(randomUUID());
  const task:CookingTask={...makeTask(targetId,candidate.version,entityId(source.optionId),now.toISOString()),state:source.state,step:source.step,
    createdAt:existing&&choice?existing.createdAt:source.createdAt,completedAt:source.completedAt,
    revision:existing&&choice?existing.revision+1:1,
    servingRevision:existing&&choice?existing.servingRevision+1:source.servingRevision,
    completionServing:source.state==="completed"?{optionId:entityId(source.optionId),revision:source.servingRevision}:null,
    feedback:source.state==="completed"?source.feedback:null};
  const timer=source.timer;
  if(timer){
    const duration=stepDuration(task);
    if(source.state!=="cooking"||timer.step!==source.step||!duration||timer.deadline!==timer.startedAt+duration*1000||
      timer.startedAt<created||timer.startedAt>now.getTime()+60000)throw new ApiError("INVALID_INPUT");
    task.timer=timer;
  }
  if(existing&&source.state!=="completed"&&!choice){
    if(existing.state===task.state&&existing.step===task.step&&existing.servingOptionId===task.servingOptionId&&
      JSON.stringify(existing.timer)===JSON.stringify(task.timer))return mapping(existing.id);
    return {conflict:existing,proposal:taskLabel(task)};
  }
  await client.query(`INSERT INTO cooking_task(account_id,id,version_id,state,revision,task) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,task=EXCLUDED.task
    WHERE cooking_task.account_id=EXCLUDED.account_id`,[account,task.id,task.snapshot.id,task.state,task.revision,task]);
  if(existing&&choice?.mode==="guest"){
    await client.query(`UPDATE shopping_workspace SET shopping=jsonb_set(shopping,'{revision}',to_jsonb((shopping->>'revision')::int+1))
      WHERE account_id=$1 AND (shopping->'selected') ? $2`,[account,existing.id]);
  }
  await client.query("INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind) VALUES($1,'task',$2,$3,'upsert')",[account,task.id,task.revision]);
  return mapping(task.id);
}

export async function mergeGuestShopping(client:pg.PoolClient,account:AccountId,transfer:Pick<CookingTransfer,"selected"|"edits">){
  if(!transfer.selected.length)return false;
  const mapping=(await client.query<{guest_task_id:string;task_id:string}>("SELECT guest_task_id,task_id FROM guest_task_map WHERE account_id=$1 AND guest_task_id=ANY($2::uuid[])",[account,transfer.selected])).rows;
  const map=new Map(mapping.map(row=>[row.guest_task_id,row.task_id]));
  const tasks=await readMergeTasks(client,account);
  const selected=transfer.selected.flatMap(id=>{const target=map.get(id);return target&&tasks.some(task=>task.id===target&&activeTask(task))?[target]:[];});
  if(!selected.length)return false;
  const old=(await client.query<{shopping:KitchenWorkspace["shopping"]}>("SELECT shopping FROM shopping_workspace WHERE account_id=$1",[account])).rows[0]?.shopping??emptyWorkspace().shopping;
  const shopping={selected:[...new Set([...old.selected,...selected])],edits:{...old.edits},revision:old.revision+1};
  for(const item of shoppingRows({tasks,shopping})){
    const edit=Object.hasOwn(transfer.edits,item.id)?transfer.edits[item.id]:undefined;
    if(!edit||Object.hasOwn(shopping.edits,item.id))continue;
    // Keep manual quantities. A changed ownership/portion basis requires rechecking purchase state.
    shopping.edits[item.id]={quantity:edit.quantity,purchased:false,basis:"guest-import-review"};
  }
  await client.query("INSERT INTO shopping_workspace(account_id,shopping) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET shopping=EXCLUDED.shopping",[account,shopping]);
  await client.query("INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind) VALUES($1,'shopping','current',$2,'upsert')",[account,shopping.revision]);
  return true;
}
