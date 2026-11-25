import {owner} from "../../domain/shared/validation";
import {LocalStore} from "../storage/database";
import type {Profile,Purpose} from "../../domain/profile/sections";
import type {TodayState} from "../../domain/profile/today-state";
import {businessDate} from "../../domain/calendar/clock";

export type SyncOperation = {
  operationId:string;entityType:"profile"|"today_state"|"consent";entityId:string;
  action:"save"|"delete"|"grant"|"revoke";baseRevision:number;deletionGeneration:number;
  patch:Record<string,unknown>;
};
type Barrier={entityType:string;entityId:string;generation:number};
export type Snapshot={accountId:string;profile:Profile;today:TodayState|null;barriers:Barrier[];cursor:string;conflicts:{id:string;section:Purpose;operationId:string}[]};
export type SyncConflict={id:string;section:Purpose;operationId:string;proposed:Record<string,unknown>;current:Record<string,unknown>;revision:number};
type Result={operationId:string;status:"ack"|"conflict"|"rejected";code?:string};

class SyncError extends Error {
  constructor(readonly status:number,message:string,readonly retryAfterMs=0){super(message);}
}

async function syncRequest<T>(account:string,path:string,method="GET",body?:object) {
  const response=await fetch("/api/v1/sync/"+path,{
    method,cache:"no-store",headers:{"x-profile-account":account,...(body?{"content-type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  if (!response.ok) {
    const body=await response.json().catch(()=>null);
    const retryAfter=response.headers.get("retry-after");
    const time=retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter)*1000 : retryAfter ? Date.parse(retryAfter)-Date.now() : 0;
    throw new SyncError(response.status,body?.error?.message??"同步暂不可用",Math.max(0,time||0));
  }
  return (await response.json()).data as T;
}

export function accountSnapshot(account:string){return syncRequest<Snapshot>(account,"bootstrap");}
export function readSyncConflict(account:string,id:string){return syncRequest<SyncConflict>(account,"conflicts/"+id);}
export async function resolveSyncConflict(account:string,item:SyncConflict,choice:"device"|"account"){
  await syncRequest(account,"conflicts/"+item.id+"/resolve","POST",{choice,baseRevision:item.revision,operationId:crypto.randomUUID()});
  const store=new LocalStore(owner("account",account));
  try{await store.acknowledge(item.operationId);}finally{store.close();}
}

export async function queueOperation(account:string,operation:Omit<SyncOperation,"operationId">){
  const store=new LocalStore(owner("account",account));
  const item={...operation,operationId:crypto.randomUUID()};
  try {
    const existing=(await store.pending()).find(record=>record.collection===item.entityType&&record.entityId===item.entityId);
    // Identical form retries use the persisted operation identity.
    if (existing) {
      const queued=existing.payload as SyncOperation;
      const {operationId,...values}=queued;
      if(JSON.stringify(values)===JSON.stringify(operation)) return operationId;
      throw new Error("这个分区还有待处理的改动，请先在个人中心同步或放弃该项。");
    }
    await store.enqueue({operationId:item.operationId,collection:item.entityType,entityId:item.entityId,destination:"cloud",payload:item});
    return item.operationId;
  } finally {store.close();}
}

export async function pendingCount(account:string){
  const store=new LocalStore(owner("account",account));
  try{return (await store.pending()).length;}finally{store.close();}
}
export function discardAccountCopy(account:string) {return new LocalStore(owner("account",account)).destroy();}

async function flushOnce(account:string) {
  const snapshot=await accountSnapshot(account);
  const store=new LocalStore(owner("account",account));
  try {
    const pending=(await store.pending()).map(record=>record.payload as SyncOperation);
    const skipped:string[]=[];
    const results:Result[]=[];
    const today=businessDate(new Date());
    for(const operation of pending){
      const barrier=snapshot.barriers.find(row=>row.entityType===operation.entityType&&row.entityId===operation.entityId);
      if((barrier&&barrier.generation>operation.deletionGeneration)||(operation.entityType==="today_state"&&operation.entityId!==today)){
        await store.acknowledge(operation.operationId);
        skipped.push(operation.operationId);
      }
    }
    const valid=pending.filter(item=>!skipped.includes(item.operationId));
    for(let from=0;from<valid.length;from+=50){
      const reply=await syncRequest<{results:Result[]}>(account,"mutations","POST",{operations:valid.slice(from,from+50)});
      for(const result of reply.results){
        if(result.status==="ack") await store.acknowledge(result.operationId);
        results.push(result);
      }
    }
    return {results,skipped,remaining:(await store.pending()).length};
  } finally {store.close();}
}

const active = new Map<string,ReturnType<typeof flushOnce>>();
export function flushAccount(account:string, retry=false) {
  const running=active.get(account);
  if(running)return running;
  const promise=(async()=>{
    const waits=retry?[1000,2000,4000,8000,16000]:[];
    for(let attempt=0;;attempt++){
      try{return await flushOnce(account);}
      catch(error){
        const next=waits[attempt];
        if(next===undefined||error instanceof SyncError&&error.status<500&&error.status!==429)throw error;
        const delay=Math.max(next,error instanceof SyncError?error.retryAfterMs:0);
        if(delay>60000)throw error;
        await new Promise(resolve=>setTimeout(resolve,delay));
      }
    }
  })().finally(()=>active.delete(account));
  active.set(account,promise);
  return promise;
}

export async function pushOperation(account:string,operation:Omit<SyncOperation,"operationId">){
  const operationId=await queueOperation(account,operation);
  let result;
  try{result=await flushAccount(account);}catch{throw new Error("改动已保留在本机，等待同步。可在个人中心重试。");}
  if(result.skipped.includes(operationId))throw new Error("旧改动已清除，请按账户的当前资料重新填写。");
  if(result.results.find(item=>item.operationId===operationId)?.status!=="ack") {
    throw new Error("改动尚未同步。账户记录可能已更新，请在个人中心处理待同步项。");
  }
}

export async function discardPendingSection(account:string,section:Purpose){
  const store=new LocalStore(owner("account",account));
  try {
    for(const item of await store.pending()){
      if(item.collection==="profile"&&item.entityId===section)await store.acknowledge(item.operationId);
    }
  } finally {store.close();}
}
