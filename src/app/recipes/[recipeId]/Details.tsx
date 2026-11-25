"use client";
import {useEffect,useState} from "react";
import type {RecipeCandidate} from "../../../domain/recommendations/eligibility";
import FavoriteButton from "../FavoriteButton";
import AddTask from "../AddTask";
import RecipeCover from "../../RecipeCover";
const sources={original:"典籍原文",adaptation:"现代改写",traditional_explanation:"传统解释",modern_advice:"现代营养与建议"};
export default function Details({recipeId,versionId}:{recipeId:string;versionId:string}){
 const [data,setData]=useState<RecipeCandidate|null>(null),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();fetch(`/api/v1/recipes/${encodeURIComponent(recipeId)}/versions/${encodeURIComponent(versionId)}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error?.message??"读取失败");setData(body.data);}).catch(e=>{if(e.name!=="AbortError")setError("无法读取菜谱，请稍后重试。");});return()=>controller.abort();},[recipeId,versionId]);
 if(error)return <main><h1>菜谱暂不可用</h1><p role="alert">{error}</p><a href="/kitchen">返回厨房</a></main>;
 if(!data)return <main><p role="status">正在读取菜谱…</p></main>;
 const v=data.version;const one=v.servingOptions.find(o=>Number(o.servings)===1);
 return <main><a href="/kitchen">← 返回厨房</a><p className="eyebrow">冬季菜谱 · 一人份</p><h1>{v.name}</h1><div className="recipe-detail-cover"><RecipeCover image={v.image} name={v.name}/></div>{data.lifecycle.state==="published"&&<FavoriteButton recipeId={recipeId} versionId={versionId} name={v.name}/>}{data.lifecycle.state!=="published"&&<p className="warning" role="alert">{data.lifecycle.state==="safety_withdrawn"?"此菜谱已安全撤回，请勿开始或继续制作。":"此版本已归档，不可新建制作任务。"}{data.lifecycle.withdrawalReason}</p>}<p>{v.totalMinutes===null?"耗时待确认":`总耗时 ${v.totalMinutes} 分钟`} · 备菜 {v.prepMinutes??"待确认"} · 烹饪 {v.cookMinutes??"待确认"}</p><p>设备：{v.equipment?.join("、")||"待确认"}</p><section className="panel"><h2>一人份用料</h2><ul>{v.ingredients.map(line=>{const q=one?.ingredientQuantities.find(q=>q.ingredientLineId===line.id);return <li key={line.id}>{line.rawName} — {q?.quantity!==null&&q?.quantity!==undefined?`${q.quantity} ${q.unit??"单位待确认"}`:q?.quantityText??"用量待确认"}{line.optional?"（可选）":""}</li>;})}</ul></section><section className="panel"><h2>制作步骤</h2><ol>{v.steps.map(step=><li key={step.id}><p>{step.instruction}</p>{step.heat&&<p>火候：{step.heat}</p>}<p>步骤时长：{step.durationSeconds===null?"待确认":`${step.durationSeconds} 秒`}</p>{step.safetyNotice&&<p className="warning">{step.safetyNotice}</p>}</li>)}</ol></section><section className="panel"><h2>来源与审核</h2>{v.sources.map(source=><div key={source.id}><h3>{sources[source.sourceType]}</h3><p>{source.citation}</p>{source.evidenceLevel&&<p>依据：{source.evidenceLevel}</p>}</div>)}<p className="note">内容版本：{v.rawVersion} · 已审核份量：{v.servingOptions.map(o=>`${o.servings} 人份`).join("、")}</p></section>{data.lifecycle.state==="published"&&<AddTask recipe={v}/>}</main>;
}
