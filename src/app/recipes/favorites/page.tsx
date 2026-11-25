"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import FavoriteButton,{useFavorites} from "../FavoriteButton";
import type {Favorite} from "@/client/storage/favorites";

export default function Favorites(){
  const {items,error,kind}=useFavorites();
  const [verified,setVerified]=useState<Favorite[]|null>(null);
  useEffect(()=>{
    if(!items||kind!=="guest")return;
    const controller=new AbortController();
    void Promise.all(items.map(async item=>{
      try{
        const response=await fetch("/api/v1/recipes/"+item.recipeId+"/versions/"+item.versionId,{cache:"no-store",signal:controller.signal});
        if(response.status===404)return {...item,state:"unavailable"};
        if(!response.ok)return {...item,state:"unknown"};
        const {data}=await response.json();
        return {...item,state:data.lifecycle.state};
      }catch{return {...item,state:"unknown"};}
    })).then(rows=>{if(!controller.signal.aborted)setVerified(rows);});
    return ()=>controller.abort();
  },[items,kind]);
  const rows=kind==="guest"?verified?.filter(item=>items?.some(current=>current.recipeId===item.recipeId)):items;
  return <main className="account-main">
    <div className="page-title"><Link href="/recipes">‹ 菜谱</Link><h1>我的收藏</h1></div>
    {kind&&<p className="note">{kind==="guest"?"游客收藏保存在当前浏览器。":"这里显示当前账户的收藏。"}</p>}
    {error?<p role="alert">{error}</p>:!rows?<p role="status">正在读取收藏…</p>:!rows.length?<p>还没有收藏的菜谱。</p>:rows.map(item=><article className="panel" key={item.recipeId}>
      <h2>{item.name}</h2>
      {item.state==="published"?<Link href={"/recipes/"+item.recipeId+"?version="+item.versionId}>查看菜谱 →</Link>:
        <p>{item.state==="safety_withdrawn"?"此版本已安全撤回，请勿制作。":item.state==="archived"?"此版本已归档。":"此版本暂不可用。"}</p>}
      <FavoriteButton recipeId={item.recipeId} versionId={item.versionId} name={item.name}/>
    </article>)}
  </main>;
}
