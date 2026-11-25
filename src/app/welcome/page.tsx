"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {skipOnboarding} from "../../client/storage/onboarding";
export default function Welcome(){const router=useRouter();const [error,setError]=useState("");return <main className="welcome"><p className="eyebrow">食有数 · 一人食养</p><h1>从一餐开始，<br/>让食养有数。</h1><p>跟着冬季节气，找一道适合今天的菜。<br/>无需登录，也无需先填写个人信息。</p><div className="panel"><h2>先从厨房逛起</h2><p>以后可以在个人中心主动设置口味与饮食限制。</p><button onClick={()=>{try{skipOnboarding();router.replace("/kitchen");}catch{setError("浏览器未允许保存设置，你仍可直接进入厨房。");}}}>先逛逛，跳过设置</button>{error&&<p role="alert">{error} <a href="/kitchen">进入厨房</a></p>}</div><p className="note">游客记录只保留在当前浏览器；清除站点数据可能丢失。</p></main>;}
