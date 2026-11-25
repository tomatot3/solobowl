"use client";

import Link from "next/link";
import AiConsent from "./AiConsent";
import {useEffect, useRef, useState, type FormEvent} from "react";
import {grantForEdit,safetyFields,type Purpose} from "@/domain/profile/sections";
import {deleteProfileSection,loadProfile,revokeProfileConsent,saveProfileSection,type LoadedProfile} from "@/client/storage/profile";
import type {DictionaryOption} from "@/domain/content/dictionary";
import {onAccountChange} from "@/client/storage/account-change";

const labels = {avoidances:"明确忌口",allergies:"食物过敏原",professionalRestrictions:"已有专业膳食限制"};
const purposes = {safety:"饮食限制筛选",preferences:"饮食偏好推荐"};
const copy = {
  safety:"我同意将这组饮食限制用于菜谱筛选。",
  preferences:"我同意将这组普通偏好用于菜谱排序。",
};

export default function ProfilePage() {
  const [current,setCurrent] = useState<LoadedProfile | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [formVersion,setFormVersion] = useState(0);
  const [options,setOptions]=useState<DictionaryOption[]>([]);
  const [filter,setFilter]=useState("");
  const preferenceKinds=[["flavor","flavorIds","口味与口感"],["dietary","dietaryIds","饮食类型"],["region","regionIds","地区口味"]] as const;
  const accountEpoch=useRef(0);

  useEffect(() => {
    let active = true;
    let loaded:LoadedProfile|null=null;
    loadProfile().then(profile => {if (active){loaded=profile;setCurrent(profile);}})
      .catch(() => {if (active) setError("暂时无法读取档案，请刷新后重试。");});
    fetch("/api/v1/dictionary",{cache:"no-store"}).then(async response=>{
      if(response.ok&&active)setOptions((await response.json()).data);
    }).catch(()=>{});
    function changed() {
      if(!active)return;
      active=false;
      accountEpoch.current++;
      setCurrent(null);
      setMessage("");
      setError("账户状态已变化，请刷新页面。");
    }
    async function checkSession(){
      if(!active||loaded?.kind!=="account"||document.visibilityState!=="visible")return;
      try{
        const response=await fetch("/api/v1/auth/session",{cache:"no-store"});
        if(response.status===401){changed();return;}
        if(response.ok&&(await response.json()).data?.userId!==loaded.accountId)changed();
      }catch{/* Transient network failures do not indicate a session change. */}
    }
    const stop=onAccountChange(changed);
    document.addEventListener("visibilitychange",checkSession);
    window.addEventListener("focus",checkSession);
    return () => {
      active=false;
      stop();
      document.removeEventListener("visibilitychange",checkSession);
      window.removeEventListener("focus",checkSession);
    };
  },[]);

  async function run(action: () => Promise<LoadedProfile>, success: string) {
    const epoch=accountEpoch.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result=await action();
      if(epoch!==accountEpoch.current)return;
      setCurrent(result);
      setFormVersion(value => value + 1);
      setMessage(success);
    } catch (error) {
      if(epoch===accountEpoch.current)setError(error instanceof Error ? error.message : "操作未完成，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>, section: Purpose) {
    event.preventDefault();
    if (!current || busy) return;
    const form = new FormData(event.currentTarget);
    const values = section === "safety"
      ? Object.fromEntries(safetyFields.map(field => {
        const previous = current.profile.sections.safety?.values[field] as {ids?:string[]}|undefined;
        const selected=form.getAll(field+"Ids").map(String);
        const configured=new Set(options.filter(option=>option.kind===field).map(option=>option.id));
        const preserved=(previous?.ids??[]).filter(id=>!configured.has(id));
        return [field,{state:form.get(field),ids:form.get(field)==="provided"?[...selected,...preserved]:[]}];
      }))
      : {preferredMinutes:form.get("minutes") ? Number(form.get("minutes")) : null,
        difficulty:String(form.get("difficulty")??"")||undefined,
        ...Object.fromEntries(preferenceKinds.map(([,key])=>[key,form.getAll(key).map(String)]))};
    void run(() => saveProfileSection(current,section,values,form.get("accept") === "on",options), "档案已更新。");
  }

  function choices(section: Purpose) {
    if (!current) return null;
    const existing = grantForEdit(current.profile,section);
    return <>
      {!existing && <label className="profile-consent"><input type="checkbox" name="accept"/> {copy[section]}</label>}
      <div className="actions">
        <button disabled={busy}>保存</button>
        {current.profile.sections[section]?.state !== undefined && current.profile.sections[section]?.state !== "unknown" &&
          <button type="button" className="secondary" disabled={busy} onClick={() => {
            if (window.confirm("清除这组资料？")) void run(() => deleteProfileSection(current,section),"这组资料已清除。");
          }}>清除资料</button>}
      </div>
    </>;
  }

  return (
    <main className="account-main">
      <div className="page-title"><Link href="/account">‹ 个人中心</Link><h1>我的食养档案</h1></div>
      {current && <p className="note">{current.kind === "guest" ? "游客档案保存在当前浏览器。" : "正在编辑当前邮箱账户的档案。"}</p>}
      {!current && !error && <p role="status">正在读取档案…</p>}
      {current && <>
        <section className="panel account-group">
          <h2>有什么食材需要避开？</h2>
          <p className="note">{options.some(option=>safetyFields.some(field=>field===option.kind))?"有需要避开的食材时，请选择「有需要避开的」并勾选对应项。":"具体食材选项待审核后开放。你可以先保留「尚未提供」，或明确确认没有对应限制。"}</p>
          {options.some(option=>safetyFields.some(field=>field===option.kind))&&<label>搜索限制 <input type="search" value={filter} onChange={event=>setFilter(event.target.value)}/></label>}
          <form key={"safety"+formVersion} onSubmit={event=>save(event,"safety")}>
            {safetyFields.map(field => {
              const entry = current.profile.sections.safety?.values[field] as {state?:string;ids?:string[]} | undefined;
              const available=options.filter(option=>option.kind===field);
              return <div key={field}><label className="account-row">{labels[field]}
                <select name={field} defaultValue={entry?.state ?? "unknown"} disabled={busy}>
                  <option value="unknown">尚未提供</option>
                  <option value="explicit_none">没有需要避开的</option>
                  {(available.length>0||entry?.state === "provided")&&<option value="provided">有需要避开的</option>}
                </select>
              </label>
              {available.map(option=><label key={option.id} hidden={Boolean(filter)&&!option.label.includes(filter)}>
                <input type="checkbox" name={field+"Ids"} value={option.id} defaultChecked={entry?.ids?.includes(option.id)}/> {option.label}
              </label>)}
              </div>;
            })}
            {choices("safety")}
          </form>
        </section>
        <section className="panel account-group" id="preferences">
          <h2>口味与饮食偏好</h2>
          <form key={"preferences"+formVersion} onSubmit={event=>save(event,"preferences")}>
            <label className="account-row">希望总耗时（分钟）
              <input name="minutes" type="number" min={1} max={1440} placeholder="不限" disabled={busy}
                defaultValue={Number(current.profile.sections.preferences?.values.preferredMinutes)||""}/>
            </label>
            <label className="account-row">希望的难度 <select name="difficulty" defaultValue={String(current.profile.sections.preferences?.values.difficulty??"")}>
              <option value="">都可以</option><option value="easy">简单</option><option value="medium">中等</option><option value="hard">较难</option>
            </select></label>
            {preferenceKinds.map(([kind,key,title])=>{
              const available=options.filter(item=>item.kind===kind);
              const selected=current.profile.sections.preferences?.values[key] as string[]|undefined;
              return available.length>0&&<fieldset key={kind}><legend>{title}</legend>
                {available.map(item=><label className="account-row" key={item.id}>
                  {kind==="flavor"&&item.id==="soft"?"口感：软烂":item.label}
                  <input type="checkbox" name={key} value={item.id} defaultChecked={selected?.includes(item.id)}/>
                </label>)}
                <span className="note">都可以时不勾选。</span>
              </fieldset>;
            })}
            <p className="note">普通偏好影响排序。需要严格避开的食材，请在饮食限制里设置。</p>
            {choices("preferences")}
          </form>
        </section>
      </>}
      <section className="panel account-group" id="privacy">
        <h2>资料用途与管理</h2>
        <p>饮食限制与普通偏好分别授权。你可以撤回授权，也可以在对应分区清除资料。</p>
        {current?.profile.consents.map(grant => <div className="account-row" key={grant.id}>
          <span>{purposes[grant.purpose]}</span>
          <button className="secondary" disabled={busy} onClick={() => void run(() => revokeProfileConsent(current,grant),"已撤回授权。")}>撤回授权</button>
        </div>)}
      </section>
      {current?.kind==="account"&&<AiConsent key={current.accountId} accountId={current.accountId}/>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="warning">{error}</p>}
      <Link className="button" href="/kitchen">返回厨房</Link>
    </main>
  );
}
