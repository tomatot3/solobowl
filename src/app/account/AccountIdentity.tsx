"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import {onAccountChange} from "@/client/storage/account-change";
import SyncStatus from "./SyncStatus";

export default function AccountIdentity() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/auth/session", {cache:"no-store", signal:controller.signal})
      .then(async response => {
        if (response.ok) setAccountId((await response.json()).data.userId);
        setSignedIn(response.ok);
        if (!response.ok && response.status !== 401) setError("账户服务暂不可用。");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSignedIn(false);
          setError("账户服务暂不可用。");
        }
      });
    const stop=onAccountChange(()=>location.reload());
    return () => {controller.abort();stop();};
  }, []);

  return <section className="panel account-identity">
    <span className="account-avatar" aria-hidden="true">食</span>
    <div>
      <h2>新食友</h2>
      <p className="note">{signedIn === null ? "正在读取账户状态…" : signedIn
        ? "邮箱已登录 · 游客记录仍保存在当前浏览器"
        : "未登录 · 游客记录保存在当前浏览器"}</p>
    </div>
    {signedIn === false && <Link href="/account/login" className="button">登录 / 注册</Link>}
    {signedIn && accountId && <SyncStatus id={accountId} onLogout={()=>{setSignedIn(false);setAccountId("");}}/>}
    {signedIn && <Link href="/account/merge">合并游客档案</Link>}
    {signedIn && <Link href="/account/sync">处理同步冲突</Link>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
