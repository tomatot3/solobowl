"use client";
import {useEffect,useRef,useState} from "react";
import {LocalStore} from "../../client/storage/database";
import {openGuestStore} from "../../client/storage/guest";
import {readToday,saveToday,deleteToday} from "../../client/storage/today-state";
import {systemClock} from "../../domain/calendar/clock";
export default function TodayState(){
 const [text,setText]=useState(""),[revision,setRevision]=useState(0),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);const date=useRef(systemClock.businessDate());const store=useRef<LocalStore|null>(null);
 useEffect(()=>{let active=true;const refresh=async()=>{if(document.visibilityState==="hidden")return;try{const id=localStorage.getItem("shiyoushu:guest-id");if(!id)return;store.current??=openGuestStore();const record=await readToday(store.current);if(active){date.current=systemClock.businessDate();setText(record?.text??"");setRevision(record?.revision??0);}}catch{if(active)setMessage("无法读取本地记录，请检查浏览器存储权限。");}};void refresh();const onVisible=()=>{if(date.current!==systemClock.businessDate())void refresh();};document.addEventListener("visibilitychange",onVisible);const timer=setInterval(onVisible,30000);return()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",onVisible);store.current?.close();store.current=null;};},[]);
 async function save(remove=false){setBusy(true);try{store.current??=openGuestStore();if(remove){await deleteToday(store.current,revision);setText("");setRevision(0);setMessage("今日文字已删除。");}else{const value=await saveToday(store.current,date.current,text,revision);setRevision(value.revision);setMessage("已保存在当前浏览器，次日自动清除。");}}catch{setMessage("保存未完成：日期或记录已变化，请刷新后重试。");}finally{setBusy(false);}}
 return <section className="panel" id="today-note"><h2>今天，随手记</h2><p className="note">仅记录今天的文字，不影响推荐。北京时间次日清除，不保留历史。</p><label htmlFor="today">今日文字</label><textarea id="today" value={text} maxLength={2000} onChange={e=>setText(e.target.value)} placeholder="写下今天想记住的事…"/><div className="actions"><button disabled={busy} onClick={()=>void save()}>保存今日文字</button><button className="secondary" disabled={busy||revision===0} onClick={()=>void save(true)}>删除今日文字</button></div><p role="status">{message}</p></section>;
}
