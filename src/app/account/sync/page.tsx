"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {onAccountChange} from "@/client/storage/account-change";
import {accountSnapshot,readSyncConflict,resolveSyncConflict,type SyncConflict} from "@/client/sync/engine";

function describe(section:SyncConflict["section"],values:Record<string,unknown>){
  if(section==="preferences")return typeof values.preferredMinutes==="number"?values.preferredMinutes+" 分钟":"尚未提供";
  const fields={avoidances:"明确忌口",allergies:"食物过敏原",professionalRestrictions:"专业膳食限制"};
  return Object.entries(fields).map(([key,label])=>{
    const value=values[key] as {state?:string;ids?:string[]}|undefined;
    return label+"："+(value?.state==="explicit_none"?"没有需要避开的":value?.state==="provided"?value.ids?.join("、"):"尚未提供");
  }).join(" · ");
}

export default function SyncPage(){
  const [id,setId]=useState("");
  const [items,setItems]=useState<SyncConflict[]|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [attempt,reload]=useState(0);
  useEffect(()=>{
    let active=true;
    async function load(){
      const response=await fetch("/api/v1/auth/session",{cache:"no-store"});
      if(!response.ok)throw new Error("请先登录。");
      const {data}=await response.json();
      const result=await accountSnapshot(data.userId);
      const conflicts=await Promise.all(result.conflicts.map(item=>readSyncConflict(data.userId,item.id)));
      if(active){setId(data.userId);setItems(conflicts);}
    }
    const stop=onAccountChange(()=>location.reload());
    void load().catch(error=>{if(active)setError(error.message);});
    return ()=>{active=false;stop();};
  },[attempt]);
  async function choose(item:SyncConflict,choice:"device"|"account"){
    setBusy(true);setError("");
    try{await resolveSyncConflict(id,item,choice);setItems(values=>values?.filter(value=>value.id!==item.id)??[]);}
    catch(error){setError(error instanceof Error?error.message:"选择未保存，请重试。");reload(value=>value+1);}
    finally{setBusy(false);}
  }
  return <main className="account-main">
    <div className="page-title"><Link href="/account">‹ 个人中心</Link><h1>处理同步冲突</h1></div>
    {error&&<p role="alert">{error}</p>}
    {items?.length===0&&<p>当前没有需要选择的账户冲突。</p>}
    {items?.map(item=><section className="panel account-group" key={item.id}>
      <h2>{item.section==="safety"?"饮食限制":"用时偏好"}</h2>
      <p>另一份改动　{describe(item.section,item.proposed)}</p>
      <p>账户现有记录　{describe(item.section,item.current)}</p>
      <div className="actions">
        <button disabled={busy} onClick={()=>void choose(item,"device")}>采用另一份改动</button>
        <button disabled={busy} className="secondary" onClick={()=>void choose(item,"account")}>保留账户现有记录</button>
      </div>
    </section>)}
  </main>;
}
