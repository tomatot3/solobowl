"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useKitchen} from "@/client/storage/use-kitchen";
import {verifyTask} from "@/client/storage/tasks";
import {activeTask,getServing,type Feedback} from "@/domain/tasks/model";
import {stepDuration,timerRemaining,type TaskAction} from "@/domain/cooking/progress";
import RecipeCover from "../../RecipeCover";

export default function Cook({taskId}:{taskId:string}){
  const {workspace,error,busy,reload,change}=useKitchen();
  const task=workspace?.tasks.find(item=>item.id===taskId);
  const [gate,setGate]=useState<{ok:boolean;offset:number;message:string}|null>(null);
  const [now,setNow]=useState(()=>Date.now());
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!task||!activeTask(task))return;
    let current=true;
    let sequence=0;
    async function check(){
      if(document.visibilityState==="hidden")return;
      const request=++sequence;
      try{
        const time=await verifyTask(task!,task!.state==="todo"?"start":"resume");
        if(current&&request===sequence)setGate({ok:true,offset:time.getTime()-Date.now(),message:""});
      }catch(error){
        if(current&&request===sequence)setGate({ok:false,offset:0,message:error instanceof Error?error.message:"暂时无法在线核验。"});
      }
    }
    function offline(){sequence++;setGate(old=>({ok:false,offset:old?.offset??0,message:"当前已离线，联网核验后才能继续。"}));}
    function visible(){if(document.visibilityState!=="hidden"){setGate(null);void check();}}
    void check();
    const poll=setInterval(check,30000);
    const tick=setInterval(()=>setNow(Date.now()),1000);
    window.addEventListener("offline",offline);
    window.addEventListener("online",visible);
    document.addEventListener("visibilitychange",visible);
    return ()=>{
      current=false;clearInterval(poll);clearInterval(tick);
      window.removeEventListener("offline",offline);
      window.removeEventListener("online",visible);
      document.removeEventListener("visibilitychange",visible);
    };
  },[task,retry]);
  if(!task)return <main><Link href="/cooking">‹ 做饭</Link><h1>制作任务</h1><p role="status">{error||(!workspace?"正在读取…":"找不到这项任务。")}</p></main>;
  const option=getServing(task);
  const step=task.snapshot.steps[task.step];
  const heat=step&&(option.stepOverrides.find(item=>item.stepId===step.id)?.heat??step.heat);
  const duration=stepDuration(task);
  const remaining=timerRemaining(task,now+(gate?.offset??0));
  const enabled=gate?.ok===true&&!busy;
  const active=activeTask(task);
  function action(name:TaskAction){
    if(name!=="cancel"&&!enabled)return;
    void change({kind:"task",id:taskId,revision:task!.revision,action:name}).then(result=>{
      if(!result&&name!=="cancel")setGate(null);
    });
  }
  const preparation=<>
    <label>审核份量 <select aria-label="审核份量" value={task.servingOptionId} disabled={busy} onChange={event=>{
      void change({kind:"serving",id:taskId,revision:task.revision,optionId:event.target.value});
    }}>{task.snapshot.servingOptions.filter(item=>item.reviewRef).map(item=><option key={item.id} value={item.id}>{item.servings} 人份</option>)}</select></label>
    <ul>{task.snapshot.ingredients.map(line=>{
      const amount=option.ingredientQuantities.find(item=>item.ingredientLineId===line.id);
      return <li key={line.id}>{line.rawName} {amount?.quantity!=null?amount.quantity+" "+(amount.unit??""):amount?.quantityText??"用量待确认"}</li>;
    })}</ul>
    <Link href={"/shopping?task="+taskId}>为这道菜列采购清单</Link>
  </>;
  return <main className="cook-main">
    <Link href="/cooking">‹ 待做清单</Link>
    <div className="cook-title"><RecipeCover image={task.snapshot.image} name={task.snapshot.name}/><h1>{task.snapshot.name}</h1></div>
    <p>{option.servings} 人份 · {task.state==="completed"?"已完成":task.state==="cancelled"?"已移除":task.state==="todo"?"待开始":"制作中"}</p>
    {error&&<div className="warning" role="alert">{error} <button className="secondary" onClick={()=>{void reload();setRetry(n=>n+1);}}>重新读取</button></div>}
    {active&&<>
      {!gate&&<p role="status">正在在线核验菜谱…</p>}
      {gate&&!gate.ok&&<p className="warning" role="alert">{gate.message} <button className="secondary" onClick={()=>{setGate(null);setRetry(n=>n+1);}}>重新核验</button></p>}
      {task.state==="todo"?<>
        <section className="panel account-group"><h2>准备与用量</h2>{preparation}</section>
        <div className="actions"><button disabled={!enabled} onClick={()=>action("start")}>开始做饭</button>
          <button className="secondary" disabled={busy} onClick={()=>{if(window.confirm("移除这项待做？"))action("cancel");}}>移除待做</button></div>
      </>:step&&<>
      <section className="panel cook-step">
        <h2>步骤 {task.step+1} / {task.snapshot.steps.length}</h2>
        <progress className="cook-progress" value={task.step+1} max={task.snapshot.steps.length} aria-label="跟做进度"/>
        <p className="cook-instruction">{step.instruction}</p>
        {step.ingredientLineIds.length>0&&<p>本步用料 {task.snapshot.ingredients.filter(line=>step.ingredientLineIds.includes(line.id)).map(line=>{
          const amount=option.ingredientQuantities.find(item=>item.ingredientLineId===line.id);
          return line.rawName+(amount?.quantity!=null?" "+amount.quantity+" "+(amount.unit??""):" "+(amount?.quantityText??""));
        }).join("、")}</p>}
        {heat&&<p>火候 {heat}</p>}
        {step.completionCue&&<p>判断提示 {step.completionCue}</p>}
        {step.safetyNotice&&<p className="warning">{step.safetyNotice}</p>}
        {remaining===null?((duration??0)>0?<div className="cook-time">
          {step.timerStartCue&&<p>计时起点 {step.timerStartCue}</p>}
          <button className="secondary" disabled={!enabled} onClick={()=>action("timer")}>启动计时（{duration} 秒）</button>
        </div>:<p className="note">此步骤暂无审核计时。</p>)
          :<p className="cook-timer" role="timer">{remaining>0?Math.floor(remaining/60)+":"+String(remaining%60).padStart(2,"0"):"计时已到，请自行确认食物状态。"}</p>}
        <div className="actions cook-step-actions">
          <button className="secondary" disabled={!enabled||task.step===0} onClick={()=>action("previous")}>上一步</button>
          {task.step<task.snapshot.steps.length-1?<button disabled={!enabled} onClick={()=>action("next")}>确认，下一步</button>
            :<button disabled={!enabled} onClick={()=>{if(window.confirm("确认已完成这次制作？"))action("complete");}}>确认完成</button>}
        </div>
      </section>
      <details className="panel account-group cook-preparation"><summary>准备与用量</summary>{preparation}</details>
      </>}
    </>}
    {task.state==="completed"&&<section className="panel account-group">
      <h2>这一餐做好了</h2>
      <p>完成时份量 {option.servings} 人份</p>
      <form className="recipe-form" key={task.revision} onSubmit={event=>{
        event.preventDefault();
        const values=new FormData(event.currentTarget);
        const feedback={taste:values.get("taste"),portion:values.get("portion")} as Feedback;
        void change({kind:"feedback",id:taskId,revision:task.revision,feedback});
      }}>
        <label>口味<select name="taste" defaultValue={task.feedback?.taste??"neutral"}><option value="liked">喜欢</option><option value="neutral">一般</option><option value="disliked">不合口味</option></select></label>
        <label>份量<select name="portion" defaultValue={task.feedback?.portion??"right"}><option value="small">偏少</option><option value="right">刚好</option><option value="large">偏多</option></select></label>
        <div className="actions"><button disabled={busy}>保存反馈</button><Link href="/cooking/history">查看做饭记录</Link></div>
      </form>
      {task.feedback&&<p role="status">反馈已保存。</p>}
    </section>}
  </main>;
}
