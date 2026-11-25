"use client";

import {useEffect,useState,type FormEvent} from "react";
import {mealRequestInput,type MealRequest as Conditions} from "@/domain/recommendations/meal-request";
import type {DictionaryOption} from "@/domain/content/dictionary";

export default function MealRequest({onApply,onClear}:{onApply:(request:Conditions)=>void;onClear:()=>void}) {
  const [notice,setNotice]=useState("");
  const [options,setOptions]=useState<DictionaryOption[]>([]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/v1/dictionary",{signal:controller.signal,cache:"no-store"})
      .then(async response=>{if(response.ok&&!controller.signal.aborted)setOptions((await response.json()).data);}).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const dishName=String(fields.get("dishName")??"").trim()||undefined;
    const ingredientName=String(fields.get("ingredientName")??"").trim()||undefined;
    const raw=String(fields.get("maxMinutes")??"");
    const difficulty=String(fields.get("difficulty")??"")||undefined;
    const flavorIds=fields.getAll("flavor").map(String);
    const equipmentIds=fields.getAll("equipment").map(String);
    const parsed=mealRequestInput.safeParse({dishName,ingredientName,maxMinutes:raw?Number(raw):undefined,difficulty,flavorIds,equipmentIds});
    if(!parsed.success){setNotice("请检查当餐条件和时间上限。");return;}
    if(!dishName&&!ingredientName&&!raw&&!difficulty&&!flavorIds.length&&!equipmentIds.length){setNotice("请至少填写一项当餐条件。");return;}
    setNotice("");
    onApply(parsed.data);
  }
  return <details className="panel meal-request">
    <summary>这顿想吃什么？</summary>
    <form onSubmit={submit} onReset={()=>{setNotice("");onClear();}} className="recipe-form">
      <label>菜名<input name="dishName" maxLength={48} placeholder="例如小米粥"/></label>
      <label>想吃的食材<input name="ingredientName" maxLength={48} placeholder="例如南瓜"/></label>
      <label>最多几分钟<input type="number" name="maxMinutes" min={1} max={1440} placeholder="不限"/></label>
      <label>偏好的难度<select name="difficulty"><option value="">都可以</option><option value="easy">简单</option><option value="medium">中等</option><option value="hard">较难</option></select></label>
      {(["flavor","equipment"] as const).map(kind=>options.some(item=>item.kind===kind)&&<fieldset key={kind}>
        <legend>{kind==="flavor"?"想吃的口味与口感":"本餐可用设备"}</legend>
        {options.filter(item=>item.kind===kind).map(item=><label key={item.id}><input type="checkbox" name={kind} value={item.id}/>
          {kind==="flavor"&&item.id==="soft"?"口感：软烂":item.label}</label>)}
      </fieldset>)}
      <div className="actions"><button>按当餐条件推荐</button><button type="reset" className="secondary">清空条件</button></div>
      {notice&&<p role="alert">{notice}</p>}
    </form>
  </details>;
}
