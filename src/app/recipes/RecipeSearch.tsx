"use client";

import Link from "next/link";
import {useEffect,useState,type FormEvent} from "react";
import FavoriteButton from "./FavoriteButton";
import {discoveryGuestContext} from "@/client/storage/profile";
import RecipeCover from "../RecipeCover";

type Filters={q?:string; ingredient?:string; difficulty?:string; maxMinutes?:number};
type SearchResult={difficulties:string[];nextCursor:string|null;items:{recipeId:string;versionId:string;name:string;image?:string|null;totalMinutes:string|null;difficulty:string|null}[]};
const labels:Record<string,string>={easy:"简单",medium:"中等",hard:"较难"};

export default function RecipeSearch(){
  const [state,setState]=useState<SearchResult|null>(null);
  const [filters,setFilters]=useState<Filters>({});
  const [cursor,setCursor]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(true);
  const [requestId,refresh]=useState(0);

  useEffect(()=>{
    const controller=new AbortController();
    async function search(){
      const guestContext=await discoveryGuestContext();
      const response=await fetch("/api/v1/recipes/query",{
        method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
        body:JSON.stringify({filters:{...filters,cursor:cursor??undefined},guestContext}),signal:controller.signal,
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"当前无法读取菜谱。");
      if(!controller.signal.aborted){setState(body.data);setError("");setBusy(false);}
    }
    void search().catch(error=>{if(!controller.signal.aborted){setError(error.message||"当前无法读取菜谱。");setBusy(false);}});
    return ()=>controller.abort();
  },[filters,cursor,requestId]);

  function reset(){
    setCursor(null);setFilters({});setBusy(true);setError("");
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const value=(key:string)=>String(form.get(key)??"").trim()||undefined;
    const max=value("maxMinutes");
    setBusy(true);setError("");setCursor(null);
    setFilters({q:value("q"),ingredient:value("ingredient"),difficulty:value("difficulty"),maxMinutes:max?Number(max):undefined});
  }
  return <>
    <form className="panel recipe-form" onSubmit={submit} onReset={reset}>
      <label>搜索菜名或食材<input name="q" type="search" maxLength={48} placeholder="输入菜名或食材" /></label>
      <label>指定食材<input name="ingredient" maxLength={48} placeholder="选填"/></label>
      <label>耗时上限（分钟）<input name="maxMinutes" type="number" min={1} max={1440} placeholder="不限"/></label>
      <label>难度<select name="difficulty"><option value="">不限</option>{state?.difficulties.map(id=><option key={id} value={id}>{labels[id]??id}</option>)}</select></label>
      <div className="actions"><button>查找菜谱</button><button type="reset" className="secondary">清除筛选</button></div>
    </form>
    {error?<div className="panel" role="alert"><p>{error}</p><button onClick={()=>{setBusy(true);setError("");refresh(n=>n+1);}}>重试</button></div>
      :busy?<p role="status">正在查找菜谱…</p>
      :state?.items.length?<section aria-label="查找结果">
        <div className="cards">{state.items.map(item=><article className="panel" key={item.versionId}>
          <RecipeCover image={item.image} name={item.name}/>
          <h2>{item.name}</h2>
          <p className="recipe-meta"><span>一人份</span><span>{item.totalMinutes===null?"耗时待确认":item.totalMinutes+" 分钟"}</span>{item.difficulty&&<span>{labels[item.difficulty]??item.difficulty}</span>}</p>
          <div className="actions">
            <Link href={"/recipes/"+item.recipeId+"?version="+item.versionId}>查看菜谱 →</Link>
            <FavoriteButton recipeId={item.recipeId} versionId={item.versionId} name={item.name}/>
          </div>
        </article>)}</div>
        {(state.nextCursor||cursor)&&<div className="actions">
          {cursor&&<button className="secondary" onClick={()=>{setBusy(true);setCursor(null);}}>返回第一页</button>}
          {state.nextCursor&&<button onClick={()=>{setBusy(true);setCursor(state.nextCursor);}}>下一页</button>}
        </div>}
      </section>:<section className="panel"><h2>没有符合条件的菜谱</h2><p>可以清除筛选，或等冬季菜谱完成审核后再来。</p></section>}
  </>;
}
