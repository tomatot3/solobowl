"use client";

import {useEffect,useState} from "react";
import {onAccountChange} from "@/client/storage/account-change";
import {accountSnapshot,pushOperation,type Snapshot} from "@/client/sync/engine";
import {businessDate} from "@/domain/calendar/clock";
import TodayState from "./TodayState";

type Account = {id:string; snapshot:Snapshot};
export default function TodayNote(){
  const [mode,setMode]=useState<"guest"|"account"|"error"|null>(null);
  const [account,setAccount]=useState<Account|null>(null);
  const [text,setText]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    async function load(){
      const response=await fetch("/api/v1/auth/session",{cache:"no-store"});
      if(response.status===401){
        if(active)setMode("guest");return;
      }
      if(!response.ok)throw new Error();
      const id=(await response.json()).data.userId;
      const snapshot=await accountSnapshot(id);
      if(active){setAccount({id,snapshot});setText(snapshot.today?.text??"");setMode("account");}
    }
    function changed(){
      active=false;setAccount(null);setText("");setMessage("");setMode(null);
    }
    let date=businessDate(new Date());
    const expire=()=>{
      const actual=businessDate(new Date());
      if(actual===date||!active)return;
      date=actual;
      setAccount(null);setText("");setMode(null);
      void load().catch(()=>{if(active)setMode("error");});
    };
    const timer=setInterval(expire,30000);
    document.addEventListener("visibilitychange",expire);
    const stop=onAccountChange(changed);
    void load().catch(()=>{if(active)setMode("error");});
    return()=>{active=false;clearInterval(timer);stop();document.removeEventListener("visibilitychange",expire);};
  },[]);
  async function write(remove:boolean){
    if(!account)return;
    const date=businessDate(new Date());
    if(account.snapshot.today && account.snapshot.today.businessDate!==date){
      setText("");setMessage("日期已切换，请刷新后再记录。");return;
    }
    setBusy(true);setMessage("");
    try{
      const barrier=account.snapshot.barriers.find(item=>item.entityType==="today_state"&&item.entityId===date);
      await pushOperation(account.id,{entityType:"today_state",entityId:date,action:remove?"delete":"save",baseRevision:account.snapshot.today?.revision??0,deletionGeneration:barrier?.generation??0,patch:remove?{}:{text}});
      const snapshot=await accountSnapshot(account.id);
      setAccount(current=>current?.id===account.id?{id:account.id,snapshot}:current);
      setText(snapshot.today?.text??"");
      setMessage(remove?"今日文字已清除。":"今日文字已同步到当前账户。");
    }catch(error){setMessage(error instanceof Error?error.message:"记录未完成。");}
    finally{setBusy(false);}
  }
  if(mode==="guest")return <TodayState/>;
  if(mode!=="account"||!account)return <section id="today-note" className="panel"><h2>今天，随手记</h2><p>{mode==="error"?"暂时无法读取记录，请刷新后重试。":"正在读取…请稍候。"}</p></section>;
  return <section id="today-note" className="panel">
    <h2>今天，随手记</h2>
    <p className="note">账户内仅保留当天文字，按北京时间跨日清除。此记录不用于推荐。</p>
    <label htmlFor="account-today">今日文字</label>
    <textarea id="account-today" maxLength={2000} value={text} onChange={event=>setText(event.target.value)}/>
    <div className="actions">
      <button disabled={busy} onClick={()=>void write(false)}>保存今日文字</button>
      <button className="secondary" disabled={busy||!account.snapshot.today} onClick={()=>void write(true)}>删除今日文字</button>
    </div>
    {message&&<p role="status">{message}</p>}
  </section>;
}
