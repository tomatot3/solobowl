import type {Profile, Purpose} from "../../domain/profile/sections";
import {openGuestStore} from "../storage/guest";
import {businessDate} from "../../domain/calendar/clock";
import {readToday} from "../storage/today-state";
import {readFavorites} from "../storage/favorites";
import {readWorkspace} from "../storage/tasks";
import {guestCookingTransfer,type CookingTransfer} from "../../domain/tasks/guest-transfer";
import type {KitchenWorkspace} from "../../domain/tasks/model";

const mergeKeys:[string,string][]=[["profile","current"],["today_state","current"],["favorites","list"],["cooking","workspace"]];

type MergeSection=Purpose|"today_state";
type MergeRecord={section:MergeSection;values:Record<string,unknown>;revision:number};
export type MergeView={
  id:string;status:"pending"|"partial"|"completed"|"cancelled";revision:number;applied:string[];
  conflicts:{id:string;section:MergeSection|"task";guestValues:Record<string,unknown>;accountValues:Record<string,unknown>;changed:boolean}[];
};

export async function guestMergePreview(): Promise<MergeRecord[]> {
  if (!localStorage.getItem("shiyoushu:guest-id")) return [];
  const store=openGuestStore();
  try {
    const profile=await store.get<Profile>("profile","current");
    const records:MergeRecord[]=[];
    for (const section of ["safety","preferences"] as const) {
      const value=profile?.sections[section];
      if (value?.state && value.state!=="unknown" && profile?.consents.some(grant=>grant.id===value.consentRef)) {
        records.push({section,values:value.values,revision:value.revision});
      }
    }
    const today=await readToday(store);
    if(today)records.push({section:"today_state",values:{businessDate:today.businessDate,text:today.text},revision:today.revision});
    return records;
  } finally {store.close();}
}

export async function mergeRequest<T>(path:string,account:string,method="GET",body?:object):Promise<T> {
  const response=await fetch("/api/v1/merges"+path,{
    method,cache:"no-store",headers:{"x-profile-account":account,...(body?{"content-type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  const reply=await response.json();
  if (!response.ok) throw new Error(reply.error?.message??"合并未完成，请重试。");
  return reply.data;
}

export async function guestFavoritePreview(){
  return (await readFavorites({kind:"guest"})).slice(0,50).map(({recipeId,versionId})=>({recipeId,versionId}));
}
export async function guestCookingPreview(){
  const workspace=await readWorkspace({kind:"guest"});
  return {transfer:guestCookingTransfer(workspace),key:workspace.tasks.map(task=>task.id+":"+task.revision).join(",")+"."+workspace.shopping.revision};
}

export async function startGuestMerge(account:string,records:MergeRecord[],favorites:Awaited<ReturnType<typeof guestFavoritePreview>>=[],cooking?:{transfer:CookingTransfer;key:string}) {
  if(JSON.stringify(await guestMergePreview())!==JSON.stringify(records)) throw new Error("游客档案已变化，请刷新并重新确认。");
  if(JSON.stringify(await guestFavoritePreview())!==JSON.stringify(favorites))throw new Error("游客收藏已变化，请刷新并重新确认。");
  if(cooking&&(await guestCookingPreview()).key!==cooking.key)throw new Error("游客待做或采购清单有变化，请刷新并重新确认。");
  const signature=records.map(record=>record.section+":"+record.revision).join(",")+"|"+favorites.map(item=>item.recipeId+":"+item.versionId).join(",")+"|"+(cooking?.key??"");
  const key="shiyoushu:merge-batch:"+account;
  let previous:{signature:string;id:string;date:string}|undefined;
  try {previous=JSON.parse(sessionStorage.getItem(key)??"null")??undefined;} catch {}
  const date=businessDate(new Date());
  const id=previous?.signature===signature&&previous.date===date?previous.id:crypto.randomUUID();
  sessionStorage.setItem(key,JSON.stringify({signature,id,date}));
  return mergeRequest<MergeView>("",account,"POST",{guestBatchId:id,consent:true,schemaVersion:1,records:records.map(({section,values})=>({section,values})),favorites,cooking:cooking?.transfer.tasks.length?cooking.transfer:undefined});
}

export async function mergeWithCleanupOption(account:string,records:MergeRecord[],favorites:Awaited<ReturnType<typeof guestFavoritePreview>>,cooking?:Awaited<ReturnType<typeof guestCookingPreview>>){
  const store=openGuestStore();
  try{
    const before=await store.snapshot(mergeKeys);
    const expected=JSON.stringify(before);
    const result=await startGuestMerge(account,records,favorites,cooking);
    const [profile,today,saved,cook]=before.map(entry=>entry?.value);
    const workspace=cook as KitchenWorkspace|undefined;
    const localSections=Object.entries((profile as Profile|undefined)?.sections??{}).filter(([,entry])=>entry.state!=="unknown");
    const complete=result.status==="completed"&&result.conflicts.length===0
      &&!result.applied.some(item=>item.includes("_skipped:"))
      &&localSections.every(([section,entry])=>records.some(record=>record.section===section&&record.revision===entry.revision)&&result.applied.includes(section))
      &&(!today||result.applied.includes("today_state"))
      &&(!saved||((saved as unknown[]).length===favorites.length&&(!favorites.length||result.applied.includes("favorites:"+favorites.length))))
      &&(!workspace||(!Object.keys(workspace.shopping.edits).length&&workspace.tasks.length===(cooking?.transfer.tasks.length??0)
        &&(!workspace.tasks.length||result.applied.includes("tasks:"+workspace.tasks.length))
        &&(!workspace.shopping.selected.length||result.applied.includes("shopping"))));
    const cleanup=complete&&JSON.stringify(await store.snapshot(mergeKeys))===expected?{ownerId:store.scope.id,expected}:null;
    return {result,cleanup};
  }finally{store.close();}
}

export async function clearMergedGuestCopy({ownerId,expected}:{ownerId:string;expected:string}){
  if(localStorage.getItem("shiyoushu:guest-id")!==ownerId)return false;
  const store=openGuestStore();
  try{return await store.removeUnchanged(mergeKeys,expected);}
  finally{store.close();}
}
