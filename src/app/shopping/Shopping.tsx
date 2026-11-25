"use client";
import Link from "next/link";
import {useState} from "react";
import {shoppingRows,type ShoppingRow} from "@/domain/shopping/aggregate";
import {activeTask} from "@/domain/tasks/model";
import {useKitchen} from "@/client/storage/use-kitchen";

function ShoppingItem({row,onSave,busy}:{row:ShoppingRow;onSave:(quantity:string|null,purchased:boolean)=>void;busy:boolean}){
  return <form className="panel" onSubmit={event=>{
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const value=String(fields.get("quantity")??"");
    onSave(value||null,fields.get("purchased")==="on");
  }}>
    <h3>{row.name}</h3>
    <p>菜谱用量 {row.quantity??row.quantityText??"用量待确认"} {row.unit}</p>
    {row.needsReview&&<p className="warning">选菜或份量已变更，请复核手调数量和采购状态。</p>}
    <div className="actions">
      <label>手调数量 <input name="quantity" type="number" min={0} max={99999999} step={0.0001} defaultValue={row.override??""}/>{row.unit}</label>
      <label><input name="purchased" type="checkbox" defaultChecked={row.purchased}/> 已购齐</label>
      <button disabled={busy}>保存此项</button>
    </div>
  </form>;
}

export default function Shopping({preselected}:{preselected:string|null}){
  const {workspace,scope,change,error,busy,reload}=useKitchen();
  const [draft,setDraft]=useState<string[]|null>(null);
  const initial=workspace?.shopping.selected??[];
  const tasks=workspace?.tasks.filter(activeTask)??[];
  const selected=draft??(preselected&&tasks.some(task=>task.id===preselected)?[preselected]:initial);
  const rows=workspace?shoppingRows(workspace):[];
  return <main>
    <div className="page-title"><Link href="/cooking">‹ 做饭</Link><h1>采购清单</h1></div>
    {scope&&<p className="note">{scope.kind==="guest"?"清单保存在当前浏览器。":"清单保存在当前账户。"}</p>}
    {error&&<div role="alert" className="warning">{error} <button onClick={()=>void reload()}>重新读取</button></div>}
    {workspace?<section className="panel account-group">
      <h2>为哪些菜采购？</h2>
      {tasks.length?tasks.map(task=><label className="account-row" key={task.id}>{task.snapshot.name}
        <input type="checkbox" checked={selected.includes(task.id)} onChange={event=>setDraft(event.target.checked?[...selected,task.id]:selected.filter(id=>id!==task.id))}/>
      </label>):<p>从菜谱加入待做后，可在这里选菜。</p>}
      <button disabled={busy||!tasks.length} onClick={()=>void change({kind:"select",revision:workspace.shopping.revision,selected})}>生成采购清单</button>
    </section>:!error&&<p role="status">正在读取清单…</p>}
    {workspace&&rows.length>0&&<section><h2>需要准备的食材</h2>{rows.map(row=><ShoppingItem key={row.id+":"+workspace.shopping.revision} row={row} busy={busy}
      onSave={(quantity,purchased)=>void change({kind:"edit",revision:workspace.shopping.revision,rowId:row.id,quantity,purchased})}/>)}</section>}
    <Link href="/goods" className="panel account-row">食养好物 <span aria-hidden="true">›</span></Link>
  </main>;
}
