import {useEffect,useState} from "react";
import type {AiConsentState} from "@/domain/profile/ai-consent";

async function request(accountId:string,method:string,noticeVersion?:string,signal?:AbortSignal):Promise<AiConsentState>{
  const headers=new Headers({"x-profile-account":accountId});
  if(noticeVersion)headers.set("content-type","application/json");
  const response=await fetch("/api/v1/consents/ai",{method,headers,signal,cache:"no-store",
    body:noticeVersion?JSON.stringify({accepted:true,noticeVersion}):undefined});
  const reply=await response.json();
  if(!response.ok)throw new Error(reply.error?.message??"暂时无法管理推荐增强授权。");
  return reply.data;
}

export default function AiConsent({accountId}:{accountId:string}){
  const [state,setState]=useState<AiConsentState>();
  const [accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    const controller=new AbortController();
    void request(accountId,"GET",undefined,controller.signal).then(setState).catch(()=>{});
    return ()=>controller.abort();
  },[accountId]);

  async function update(grant:boolean){
    if(!state||busy||(grant&&!accepted))return;
    setBusy(true);setError("");setMessage("");
    try{
      setState(await request(accountId,grant?"POST":"DELETE",grant?state.noticeVersion:undefined));
      setAccepted(false);
      setMessage(grant?"已授权推荐理由增强。":"已撤回推荐理由增强授权。");
    }catch(e){setError(e instanceof Error?e.message:"暂时无法管理推荐增强授权。");}
    finally{setBusy(false);}
  }

  if(!state?.noticeUrl&&!state?.granted&&!message)return null;
  return <section className="panel account-group" aria-label="推荐理由增强授权">
    <h2>推荐理由增强</h2>
    {state?.noticeUrl&&<p>你主动使用增强时，模型处理已选菜谱的事实标记和说明。<a href={state.noticeUrl}>查看处理告知</a></p>}
    {state?.granted?<button className="secondary" disabled={busy} onClick={()=>void update(false)}>撤回增强授权</button>
      :state?.noticeUrl&&<>
        <label className="profile-consent"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/> 我同意处理告知中的推荐理由增强用途。</label>
        <button disabled={!accepted||busy} onClick={()=>void update(true)}>授权增强</button>
      </>}
    {message&&<p role="status">{message}</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
