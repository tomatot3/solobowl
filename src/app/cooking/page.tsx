"use client";
import Link from "next/link";
import {activeTask,getServing} from "@/domain/tasks/model";
import {useKitchen} from "@/client/storage/use-kitchen";

export default function Cooking(){
  const {workspace,scope,error,busy,change,reload}=useKitchen();
  const active=workspace?.tasks.filter(activeTask);
  return <main>
    <div className="page-title"><h1>做饭</h1></div>
    <div className="actions"><Link className="button" href="/cooking">待做清单</Link><Link className="button secondary" href="/shopping">采购清单</Link></div>
    <h2 className="section-title">今天准备做</h2>
    {scope&&<p className="note">{scope.kind==="guest"?"待做保存在当前浏览器。":"待做保存在当前账户，可在其他设备查看。"}</p>}
    {error&&<div role="alert" className="panel"><p>{error}</p><button onClick={()=>void reload()}>重新读取</button></div>}
    {!workspace&&!error&&<p role="status">正在读取待做…</p>}
    {active?.length===0&&<div className="panel"><p>待做清单还是空的。</p><Link href="/recipes">去选一道菜</Link></div>}
    <div className="cards">{active?.map(task=><article className="panel" key={task.id}>
      <h2>{task.snapshot.name}</h2>
      <p>{getServing(task).servings} 人份 · {task.state==="todo"?"待开始":"制作中"}</p>
      <div className="actions">
        <Link className="button" href={"/cooking/"+task.id}>{task.state==="todo"?"开始做饭":"继续做饭"}</Link>
        <Link href={"/shopping?task="+task.id}>为这道菜列采购清单</Link>
        <button className="secondary" disabled={busy} onClick={()=>{
          if(window.confirm("移除这项待做？"))void change({kind:"task",id:task.id,revision:task.revision,action:"cancel"});
        }}>移除</button>
      </div>
    </article>)}</div>
    <Link href="/cooking/history" className="panel account-row">做饭记录 <span aria-hidden="true">›</span></Link>
  </main>;
}
