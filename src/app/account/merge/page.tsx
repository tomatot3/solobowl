"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {onAccountChange} from "@/client/storage/account-change";
import {clearMergedGuestCopy,guestCookingPreview,guestFavoritePreview,guestMergePreview,mergeRequest,mergeWithCleanupOption,type MergeView} from "@/client/sync/merge";

const titles={safety:"饮食限制",preferences:"用时偏好",today_state:"今日文字",task:"同一道菜的不同进度",task_selected:"制作进度",shopping:"采购清单"};
const safetyLabels={avoidances:"明确忌口",allergies:"食物过敏原",professionalRestrictions:"专业膳食限制"};
function appliedLabel(item:string){
  if(item.startsWith("favorites:"))return item.split(":")[1]+" 项收藏";
  if(item.startsWith("favorites_skipped:"))return item.split(":")[1]+" 项收藏未导入（已删除、不可用或限制待确认）";
  if(item.startsWith("tasks:"))return item.split(":")[1]+" 项做饭记录";
  if(item.startsWith("tasks_skipped:"))return item.split(":")[1]+" 项做饭记录未导入，请查看菜谱和限制状态";
  return titles[item as keyof typeof titles];
}

function summary(section:keyof typeof titles, values:Record<string,unknown>){
  if(section==="task"){
    const labels:Record<string,string>={todo:"待开始",cooking:"制作中",completed:"已完成",cancelled:"已移除"};
    return typeof values.name==="string"?values.name+" · "+(labels[String(values.state)]??"")+" · 第 "+String(values.step)+" 步 · "+String(values.servings)+" 人份":"记录已变化";
  }
  if(section==="today_state") return typeof values.text==="string"?values.text:"尚未提供";
  if(section==="preferences"){
    const time=typeof values.preferredMinutes==="number"?values.preferredMinutes+" 分钟":undefined;
    const difficulty=typeof values.difficulty==="string"?({easy:"简单",medium:"中等",hard:"较难"} as Record<string,string>)[values.difficulty]:undefined;
    const labels=["flavorIds","dietaryIds","regionIds"].flatMap(key=>Array.isArray(values[key])?values[key] as string[]:[]);
    return [time,difficulty,...labels].filter(Boolean).join(" · ")||"尚未提供";
  }
  return Object.entries(safetyLabels).map(([key,label])=>{
    const item=values[key] as {state?:string;ids?:string[]}|undefined;
    const description=item?.state==="explicit_none"?"没有需要避开的":item?.state==="provided"?item.ids?.join("、"):"尚未提供";
    return label+"："+description;
  }).join(" · ");
}

export default function MergePage(){
  const [account,setAccount]=useState("");
  const [records,setRecords]=useState<Awaited<ReturnType<typeof guestMergePreview>>>([]);
  const [favorites,setFavorites]=useState<Awaited<ReturnType<typeof guestFavoritePreview>>>([]);
  const [cooking,setCooking]=useState<Awaited<ReturnType<typeof guestCookingPreview>>>();
  const [merge,setMerge]=useState<MergeView|null>(null);
  const [error,setError]=useState("");
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [cleanup,setCleanup]=useState<Parameters<typeof clearMergedGuestCopy>[0]|null>(null);
  const [cleared,setCleared]=useState(false);
  useEffect(()=>{
    let active=true;
    async function load(){
      const response=await fetch("/api/v1/auth/session",{cache:"no-store"});
      if(!response.ok) throw new Error("请先登录已验证邮箱的账户。");
      const {data}=await response.json();
      const [local,pending,localFavorites,localCooking]=await Promise.all([guestMergePreview(),mergeRequest<MergeView|null>("",data.userId),guestFavoritePreview(),guestCookingPreview()]);
      if(!active)return;
      setAccount(data.userId);setRecords(local);setFavorites(localFavorites);setCooking(localCooking);setMerge(pending);setReady(true);
    }
    const stop=onAccountChange(()=>location.reload());
    void load().catch(err=>{if(active)setError(err.message);});
    return ()=>{active=false;stop();};
  },[]);
  async function run(work:()=>Promise<MergeView>){
    setBusy(true);setError("");
    try{setMerge(await work());}
    catch(err){setError(err instanceof Error?err.message:"操作未完成");}
    finally{setBusy(false);}
  }
  const taskCount=cooking?.transfer.tasks.length??0;
  const hasLocal=records.length+favorites.length+taskCount>0;
  return <main className="account-main">
    <div className="page-title"><Link href="/account">‹ 个人中心</Link><h1>合并游客档案</h1></div>
    {!ready&&!error&&<p role="status">正在读取档案…</p>}
    {ready&&!merge&&<section className="panel account-group">
      <h2>{hasLocal?"当前浏览器有游客档案":"暂无可合并的游客档案"}</h2>
      {hasLocal&&<>
        <ul>{records.map(record=><li key={record.section}>{titles[record.section]}</li>)}{favorites.length>0&&<li>{favorites.length} 项收藏</li>}{taskCount>0&&<li>{taskCount} 项做饭记录及关联采购清单</li>}</ul>
        <p>确认后会上传以上资料。饮食限制和偏好仅按对应的用途使用，今日文字仅作记录。遇到不同记录时，请逐项选择。</p>
        <button disabled={busy} onClick={()=>void run(async()=>{
          const response=await mergeWithCleanupOption(account,records,favorites,cooking);
          setCleanup(response.cleanup);
          return response.result;
        })}>确认合并并授权</button>
      </>}
      <Link href="/account" className="button secondary">{hasLocal?"暂不合并":"返回个人中心"}</Link>
    </section>}
    {merge&&<section className="panel account-group">
      <h2>{merge.status==="completed"?"本次合并已完成":merge.status==="cancelled"?"本次合并已结束":"请选择要保留的记录"}</h2>
      <p className="note">{cleared?"已清理本机的游客副本。":"游客原记录仍在当前浏览器。"}已经合并的资料保存在账户里。</p>
      {cleanup&&!cleared&&<button className="secondary" disabled={busy} onClick={()=>{
        if(!window.confirm("清理当前浏览器中本次已合并的游客副本？"))return;
        void run(async()=>{
          if(!await clearMergedGuestCopy(cleanup))throw new Error("游客记录已变化，已保留本机副本。");
          setCleared(true);
          return merge;
        });
      }}>清理已合并的游客副本</button>}
      {merge.applied.filter(item=>!item.includes("_skipped:")).length>0&&<p>已合并 {merge.applied.filter(item=>!item.includes("_skipped:")).map(appliedLabel).join("、")}。</p>}
      {merge.applied.filter(item=>item.includes("_skipped:")).length>0&&<p>{merge.applied.filter(item=>item.includes("_skipped:")).map(appliedLabel).join("、")}</p>}
      {merge.conflicts.map(conflict=><section className="panel" key={conflict.id}>
        <h3>{titles[conflict.section]}</h3>
        <p>游客档案　{summary(conflict.section,conflict.guestValues)}</p>
        <p>账户档案　{summary(conflict.section,conflict.accountValues)}</p>
        {conflict.changed&&<p className="note">账户档案已变化。提交选择后会刷新，请再确认。</p>}
        <div className="actions">{(["guest","account"] as const).map(choice=><button key={choice} type="button" disabled={busy} onClick={()=>{
          const operationId=crypto.randomUUID();
          void run(()=>mergeRequest("/"+merge.id+"/resolve",account,"POST",{
            baseRevision:merge.revision,operationId,choices:[{conflictId:conflict.id,choice}],
          }));
        }}>{choice==="guest"?"使用游客档案":"保留账户档案"}</button>)}</div>
      </section>)}
      {merge.conflicts.length>0&&<button className="secondary" disabled={busy} onClick={()=>{
        if(window.confirm("结束剩余合并？已合并的资料会保留。")) void run(()=>mergeRequest("/"+merge.id,account,"DELETE"));
      }}>结束剩余合并</button>}
    </section>}
    {error&&<p role="alert" className="warning">{error}</p>}
  </main>;
}
