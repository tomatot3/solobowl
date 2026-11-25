"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {RecipeVersion} from "@/domain/recipes/types";
import {changeWorkspace,kitchenScope} from "@/client/storage/tasks";

export default function AddTask({recipe}:{recipe:RecipeVersion}){
  const router=useRouter();
  const options=recipe.servingOptions.filter(option=>option.reviewRef);
  const [option,setOption]=useState(options.find(item=>Number(item.servings)===1)?.id??options[0]?.id??"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const pending=useRef<{option:string;id:string}|null>(null);
  async function add(){
    if(busy||!option)return;
    const key=pending.current?.option===option?pending.current.id:crypto.randomUUID();
    pending.current={option,id:key};
    setBusy(true);setError("");
    try{
      const scope=await kitchenScope();
      const result=await changeWorkspace(scope,{kind:"create",recipeId:recipe.recipeId,versionId:recipe.id,optionId:option},recipe,key);
      if(!result.taskId)throw new Error("任务未创建，请重试。");
      router.push("/cooking/"+result.taskId);
    }catch(error){setError(error instanceof Error?error.message:"加入待做失败，请重试。");}
    finally{setBusy(false);}
  }
  if(!options.length)return null;
  return <section className="panel">
    <h2>加入待做</h2>
    <div className="actions">
      <label>份量 <select value={option} onChange={event=>setOption(event.target.value)} disabled={busy}>
        {options.map(item=><option key={item.id} value={item.id}>{item.servings} 人份</option>)}
      </select></label>
      <button disabled={busy} onClick={()=>void add()}>{busy?"核验中…":"加入待做"}</button>
    </div>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
