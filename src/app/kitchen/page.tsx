"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import type {SeasonContext} from "../../domain/calendar/context";
import TodayNote from "./TodayNote";
import MealRequest from "./MealRequest";
import type {MealRequest as Conditions} from "@/domain/recommendations/meal-request";
import {discoveryGuestContext} from "@/client/storage/profile";
import RecommendationCard from "./RecommendationCard";

type Card = {
  recipeId: string;
  versionId: string;
  name: string;
  image?: string | null;
  totalMinutes: string | null;
  role: string;
  reason: string;
};

type Result = {status: string; results: Card[]; ai?:{status:string}};

const winterTermNames: Readonly<Record<string, string>> = {
  lidong: "立冬",
  xiaoxue: "小雪",
  daxue: "大雪",
  dongzhi: "冬至",
  xiaohan: "小寒",
  dahan: "大寒",
};

export default function Kitchen() {
  const [season, setSeason] = useState<SeasonContext | null>(null);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [errorCode,setErrorCode]=useState("");
  const [attempt, setAttempt] = useState(0);
  const [meal,setMeal]=useState<Conditions|undefined>();
  const [enhance,setEnhance]=useState(false);
  const [excluded,setExcluded]=useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    async function loadSeason() {
      try {
        const response = await fetch("/api/v1/season-context", {cache: "no-store", signal: controller.signal});
        if (response.ok) setSeason((await response.json()).data);
        else setSeason(null);
      } catch {
        if (!controller.signal.aborted) setSeason(null);
      }
    }
    async function loadRecommendations() {
      try {
        const guestContext=await discoveryGuestContext();
        const response = await fetch("/api/v1/recommendations", {
          method: "POST", headers: {"content-type": "application/json"},
          body:JSON.stringify({mealRequest:meal,enhanceRequested:enhance,guestContext,excludeRecipeId:excluded}),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) {
          setErrorCode(body.error?.code??"");
          setError(body.error?.message || "推荐暂不可用，请稍后重试。");
          return;
        }
        setData(body.data);
        setError("");
        setErrorCode("");
      } catch {
        if (!controller.signal.aborted) setError("推荐暂不可用，请稍后重试。");
      }
    }
    void loadSeason();
    void loadRecommendations();
    return () => controller.abort();
  }, [attempt,meal,enhance,excluded]);

  const term = season?.scope === "winter_open" && season.currentTerm
    ? winterTermNames[season.currentTerm]
    : undefined;

  return (
    <main className="kitchen-main">
      <div className="kitchen-top">
        <p className="eyebrow">冬季食养</p>
        <Link href="/account" className="account-entry">个人中心</Link>
      </div>
      <div className="season-heading">
        <h1>{term ? [term, season?.houContent?.name].filter(Boolean).join(" · ") : "今天，吃点什么？"}</h1>
        {term && season?.houContent && <p>{season.houContent.text}</p>}
      </div>
      <Link href="#today-note" className="panel account-row kitchen-quick-note">
        今日状态 <span aria-hidden="true">记一笔 ›</span>
      </Link>
      <MealRequest onApply={request=>{setData(null);setError("");setExcluded(undefined);setMeal(request);}} onClear={()=>{setData(null);setError("");setExcluded(undefined);setMeal(undefined);setAttempt(value=>value+1);}}/>
      <section aria-label="时令推荐">
        <h2 className="section-title">今日食笺</h2>
        {error ? (
          <div className="panel" role="alert">
            <h3>暂时无法获取推荐</h3>
            <p>{error}</p>
            {errorCode==="SAFETY_CONFLICT"
              ? <Link className="button" href="/account">前往个人中心处理</Link>
              : <button onClick={() => {setError(""); setData(null); setAttempt(value => value + 1);}}>重新尝试</button>}
          </div>
        ) : !data ? (
          <p role="status">正在寻找冬季菜谱…</p>
        ) : data.status === "scope_closed" ? (
          <div className="panel">
            <h3>当前不在冬季推荐时段</h3>
            <Link href="/recipes">逛逛冬季菜谱</Link>
          </div>
        ) : data.status === "no_candidates" ? (
          <div className="panel"><h3>暂时没有符合条件的菜谱</h3>{meal?.maxMinutes!==undefined&&<p>本餐时间上限为 {meal.maxMinutes} 分钟，耗时未确认的菜谱也会排除。</p>}</div>
        ) : (
          <>
            <div className="recommendation-cards">{data.results.map(card => <RecommendationCard key={card.versionId} {...card} portion="一人份" href={"/recipes/"+card.recipeId+"?version="+card.versionId}/>)}</div>
            {data.results.length>1&&<button className="secondary recommendation-switch" onClick={()=>{setData(null);setExcluded(data.results[0]?.recipeId);}}>更换推荐菜谱</button>}
            {data.ai?.status==="succeeded"?<p className="note">依据已核验的菜谱信息补充了推荐理由。</p>:
              enhance?<p className="note" role="status">本次使用规则推荐，增强理由暂不可用。</p>:
              <button className="secondary" onClick={()=>{setData(null);setEnhance(true);}}>尝试增强推荐理由</button>}
          </>
        )}
        {excluded&&<button className="secondary recommendation-switch" onClick={()=>{setData(null);setExcluded(undefined);}}>恢复原推荐</button>}
      </section>
      <Link href="/goods" className="panel account-row">食养好物 <span aria-hidden="true">›</span></Link>
      <TodayNote/>
    </main>
  );
}
