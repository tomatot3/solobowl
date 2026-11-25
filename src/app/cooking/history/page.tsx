"use client";
import Link from "next/link";
import {useKitchen} from "@/client/storage/use-kitchen";

export default function History(){
  const {workspace,error,reload}=useKitchen();
  const records=workspace?.tasks.filter(task=>task.state==="completed")
    .sort((a,b)=>(b.completedAt??"").localeCompare(a.completedAt??""));
  return <main className="account-main">
    <div className="page-title"><Link href="/cooking">‹ 做饭</Link><h1>做饭记录</h1></div>
    {error&&<p role="alert">{error} <button onClick={()=>void reload()}>重试</button></p>}
    {!records&&!error&&<p role="status">正在读取记录…</p>}
    {records?.length===0&&<p>还没有完成的做饭记录。</p>}
    {records?.map(task=><article className="panel" key={task.id}><h2>{task.snapshot.name}</h2>
      <p>{task.completedAt&&new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",dateStyle:"medium",timeStyle:"short"}).format(new Date(task.completedAt))}</p>
      <p>完成时 {task.snapshot.servingOptions.find(option=>option.id===task.completionServing?.optionId)?.servings} 人份</p>
      <Link href={"/cooking/"+task.id}>查看记录与反馈 ›</Link>
    </article>)}
  </main>;
}
