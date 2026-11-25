"use client";
import {useEffect,useState} from "react";
import {discardAccountCopy,flushAccount,pendingCount} from "@/client/sync/engine";
import {signalAccountChange} from "@/client/storage/account-change";

export default function SyncStatus({id,onLogout}:{id:string;onLogout:()=>void}){
  const [count,setCount]=useState(0);
  const [confirming,setConfirming]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let active=true;
    async function readPending(){
      try{const value=await pendingCount(id);if(active)setCount(value);}
      catch{if(active)setMessage("无法读取本机待同步记录。");}
    }
    async function reconnect(){
      try{
        if(!await pendingCount(id)||!active)return;
        const result=await flushAccount(id,true);
        if(active)setCount(result.remaining);
      }catch{if(active)setMessage("改动仍保留在本机，可手动重试同步。");}
    }
    void readPending();
    window.addEventListener("online",reconnect);
    document.addEventListener("visibilitychange",readPending);
    return()=>{
      active=false;
      window.removeEventListener("online",reconnect);
      document.removeEventListener("visibilitychange",readPending);
    };
  },[id]);
  async function action(choice:"retry"|"logout"|"sync-exit"|"discard-exit"|"discard"){
    setBusy(true);setMessage("");
    try{
      if(choice==="logout"&&await pendingCount(id)){
        setConfirming(true);return;
      }
      if(choice==="retry"||choice==="sync-exit"){
        const result=await flushAccount(id,true);
        setCount(result.remaining);
        if(result.remaining){setMessage("部分改动仍待处理。可以保留在本机，或放弃后重新编辑。");return;}
        if(choice==="retry"){
          setMessage(result.skipped.length?"已清除过期或已在账户删除的旧改动。":"同步完成。");
          return;
        }
      }
      if(choice==="discard"){
        await discardAccountCopy(id);setCount(0);setMessage("已放弃本机未同步改动。");return;
      }
      const response=await fetch("/api/v1/auth/logout",{method:"POST",headers:{"content-type":"application/json","x-profile-account":id},body:"{}"});
      if(!response.ok)throw new Error("退出未完成，请重试。");
      signalAccountChange();
      await discardAccountCopy(id);
      onLogout();
    }catch(error){setMessage(error instanceof Error?error.message:"操作未完成。");}
    finally{setBusy(false);}
  }
  return <div className="account-sync">
    {count>0&&<p>{count} 项本机改动待同步</p>}
    {count>0&&!confirming&&<div className="actions">
      <button disabled={busy} onClick={()=>void action("retry")}>重试同步</button>
      <button disabled={busy} className="secondary" onClick={()=>{if(window.confirm("放弃此账户本机未同步的改动？"))void action("discard");}}>放弃未同步改动</button>
    </div>}
    {confirming?<div className="actions" role="group" aria-label="处理未同步改动">
      <button disabled={busy} onClick={()=>void action("sync-exit")}>同步后退出</button>
      <button disabled={busy} className="secondary" onClick={()=>void action("discard-exit")}>放弃未同步并退出</button>
      <button disabled={busy} className="secondary" onClick={()=>setConfirming(false)}>取消</button>
    </div>:<button className="secondary" disabled={busy} onClick={()=>void action("logout")}>退出登录</button>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
