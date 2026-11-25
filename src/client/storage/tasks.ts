import type {RecipeVersion} from "../../domain/recipes/types";
import {entityId} from "../../domain/shared/validation";
import {activeTask,emptyWorkspace,getServing,makeTask,type KitchenWorkspace,type CookingTask} from "../../domain/tasks/model";
import {kitchenCommand,updateWorkspace,type KitchenCommand} from "../../domain/tasks/commands";
import {requiresAvailability} from "../../domain/cooking/progress";
import {openGuestStore} from "./guest";
import {discoveryGuestContext} from "./profile";

export type KitchenScope={kind:"guest"}|{kind:"account";id:string};
const key="shiyoushu:kitchen-scope";
export async function kitchenScope():Promise<KitchenScope>{
  let response:Response;
  try{response=await fetch("/api/v1/auth/session",{cache:"no-store"});}
  catch{
    if(sessionStorage.getItem(key)==="guest:"+localStorage.getItem("shiyoushu:account-changed"))return {kind:"guest"};
    throw new Error("请联网确认账户状态。");
  }
  if(response.status===401){
    sessionStorage.setItem(key,"guest:"+localStorage.getItem("shiyoushu:account-changed"));
    return {kind:"guest"};
  }
  sessionStorage.removeItem(key);
  if(!response.ok)throw new Error("暂时无法读取账户。");
  return {kind:"account",id:(await response.json()).data.userId};
}

export async function availability(versionId:string,optionId:string,action:"create"|"start"|"resume"|"step"){
  try{
    const guestContext=await discoveryGuestContext();
    const response=await fetch("/api/v1/recipe-versions/"+versionId+"/availability",{
      method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
      body:JSON.stringify({action,servingOptionId:optionId,guestContext}),signal:AbortSignal.timeout(8000),
    });
    const reply=await response.json();
    if(!response.ok)throw new Error(reply.error?.message??"暂时无法核验菜谱。");
    return reply.data as {allowed:boolean;contentHash:string;checkedAt:string;reason:string};
  }catch(error){
    throw new Error(error instanceof Error&&error.name!=="TypeError"&&error.name!=="TimeoutError"?error.message:"无法在线核验菜谱，请联网重试。");
  }
}
export async function verifyTask(task:CookingTask,action:"start"|"resume"|"step"){
  const check=await availability(task.snapshot.id,getServing(task).id,action);
  if(!check.allowed||check.contentHash!==task.snapshot.contentHash) throw new Error("此菜谱版本暂不可继续制作。请检查归档或撤回状态。");
  const checkedAt=new Date(check.checkedAt);
  if(!Number.isFinite(checkedAt.getTime()))throw new Error("核验未完成，请重试。");
  return checkedAt;
}

export async function readWorkspace(scope:KitchenScope):Promise<KitchenWorkspace>{
  if(scope.kind==="account"){
    const response=await fetch("/api/v1/tasks",{cache:"no-store",headers:{"x-profile-account":scope.id}});
    const reply=await response.json();
    if(!response.ok)throw new Error(reply.error?.message??"暂时无法读取待做。");
    return reply.data;
  }
  if(!localStorage.getItem("shiyoushu:guest-id"))return emptyWorkspace();
  const store=openGuestStore();
  try{return await store.get<KitchenWorkspace>("cooking","workspace")??emptyWorkspace();}
  finally{store.close();}
}
type Result={workspace:KitchenWorkspace;taskId:string|null;existingTask:boolean};
export async function changeWorkspace(scope:KitchenScope,command:KitchenCommand,snapshot?:RecipeVersion,operationId=crypto.randomUUID()):Promise<Result>{
  const input=kitchenCommand.parse(command);
  if(scope.kind==="account"){
    const response=await fetch("/api/v1/tasks",{method:"POST",headers:{"content-type":"application/json","idempotency-key":operationId,"x-profile-account":scope.id},body:JSON.stringify(input)});
    const reply=await response.json();
    if(!response.ok)throw new Error(reply.error?.message??"操作未完成，请重试。");
    return reply.data;
  }
  const current=await readWorkspace(scope);
  let checkedAt=new Date();
  let taskId:string|null="id" in input?input.id:null;
  let existingTask=false;
  if(input.kind==="create"){
    const existing=current.tasks.find(task=>activeTask(task)&&task.snapshot.id===input.versionId);
    if(existing)return {workspace:current,taskId:existing.id,existingTask:true};
    if(snapshot?.id!==input.versionId||snapshot.recipeId!==input.recipeId)throw new Error("菜谱已变化，请重新打开。");
    const check=await availability(input.versionId,input.optionId,"create");
    if(!check.allowed||check.contentHash!==snapshot.contentHash)throw new Error("此版本暂不可加入待做。请检查归档或撤回状态。");
    checkedAt=new Date(check.checkedAt);
  }else if(input.kind==="task"&&requiresAvailability(input.action)){
    const task=current.tasks.find(item=>item.id===input.id);
    if(!task)throw new Error("任务不存在。");
    if(input.action==="complete"&&task.state==="completed")return {workspace:current,taskId:task.id,existingTask:true};
    checkedAt=await verifyTask(task,input.action==="start"?"start":input.action==="resume"?"resume":"step");
  }
  const store=openGuestStore();
  try{
    const workspace=(await store.update<KitchenWorkspace>("cooking","workspace",value=>{
      const latest=value??emptyWorkspace();
      if(input.kind!=="create"){
        try{return updateWorkspace(latest,input,checkedAt);}
        catch(error){if(error instanceof Error&&error.message==="REVISION_CONFLICT")throw new Error("记录已变化，请刷新后重试。");throw error;}
      }
      const already=latest.tasks.find(task=>activeTask(task)&&task.snapshot.id===input.versionId);
      if(already){taskId=already.id;existingTask=true;return latest;}
      const task=makeTask(entityId(crypto.randomUUID()),snapshot!,entityId(input.optionId),checkedAt.toISOString());
      taskId=task.id;
      return {...latest,tasks:[task,...latest.tasks]};
    }))!;
    return {workspace,taskId,existingTask};
  }finally{store.close();}
}
