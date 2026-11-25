"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useState, type FormEvent} from "react";
import {signalAccountChange} from "@/client/storage/account-change";
import type {AppConfig} from "@/server/config";

type Mode = "login" | "register" | "verify" | "reset-password";
const copy = {
  login: {title: "登录食有数", button: "登录"},
  register: {title: "注册食有数", button: "注册"},
  verify: {title: "验证邮箱", button: "重发验证邮件"},
  "reset-password": {title: "找回密码", button: "获取重置链接"},
};

export default function AuthForm({mode, loginMode}: {mode: Mode; loginMode: AppConfig["AUTH_LOGIN_MODE"]}) {
  const router = useRouter();
  const usernameMode = loginMode === "username";
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setReady(true);
      if (mode !== "verify" && mode !== "reset-password") return;
      const value = new URLSearchParams(location.hash.slice(1)).get("token");
      if (!value) return;
      history.replaceState(history.state, "", location.pathname + location.search);
      setToken(value);
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const confirming = Boolean(token);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    let action: string = mode;
    let payload: object = usernameMode ? {username: form.get("username"), password} : {email, password};
    if (mode === "verify") {
      action = confirming ? "verification/confirm" : "verification/request";
      payload = confirming ? {token} : {email};
    }
    if (mode === "reset-password") {
      action = confirming ? "password/reset-confirm" : "password/reset-request";
      payload = confirming ? {token, newPassword: password} : {email};
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/" + action, {
        method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message || "操作未完成，请重试。");
        return;
      }
      if (mode === "login") {
        signalAccountChange();
        router.replace("/account/merge");
        return;
      }
      if (mode === "register" && usernameMode) {
        setDone(true);
        setMessage("注册成功，可以登录了。");
        return;
      }
      if (confirming) {
        setDone(true);
        setMessage(mode === "verify" ? "邮箱已验证，可以登录。" : "密码已重置，请重新登录。");
      } else {
        setMessage("如果该邮箱符合条件，将收到下一步链接。本地开发环境可查看测试收件箱。");
      }
    } catch {
      setError("连接失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const resetConfirm = confirming && mode === "reset-password";
  const showPassword = mode === "login" || mode === "register" || resetConfirm;
  const button = confirming ? (mode === "verify" ? "确认验证" : "设置新密码") : copy[mode].button;
  return (
    <main className="account-main auth-main">
      <Link href="/account">‹ 返回个人中心</Link>
      <div className="season-heading"><h1>{copy[mode].title}</h1></div>
      <section className="panel auth-panel">
        {!done && <form method="post" onSubmit={submit}>
          {!confirming && (usernameMode
            ? <label>账号名<input name="username" autoComplete="username" minLength={3} maxLength={24}
                pattern="[A-Za-z0-9_]{3,24}" required aria-describedby={mode === "register" ? "username-policy" : undefined} /></label>
            : <label>邮箱<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>)}
          {usernameMode && mode === "register" && <p id="username-policy" className="note">使用 3–24 个英文字母、数字或下划线。</p>}
          {showPassword && <label>{resetConfirm ? "新密码" : "密码"}
            <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "login" ? undefined : 12} maxLength={128} required aria-describedby={mode === "login" ? undefined : "password-policy"} />
          </label>}
          {showPassword && mode !== "login" && <p id="password-policy" className="note">使用 12–128 个字符。</p>}
          {confirming && mode === "verify" && <p>点击下方按钮完成邮箱验证。</p>}
          <button disabled={!ready || busy}>{busy ? "处理中…" : button}</button>
        </form>}
        {message && <p role="status">{message}</p>}
        {error && <p className="warning" role="alert">{error}</p>}
        <div className="actions auth-links">
          {mode !== "login" ? <Link href="/account/login">去登录</Link> : <Link href="/account/register">注册新账户</Link>}
          {!usernameMode && mode === "login" && <Link href="/account/reset-password">忘记密码</Link>}
          {!usernameMode && mode !== "verify" && <Link href="/account/verify">验证邮箱</Link>}
          {confirming && error && <button type="button" className="secondary" onClick={() => {setToken(""); setError("");}}>重新获取链接</button>}
        </div>
      </section>
      <Link href="/kitchen">先逛逛厨房 →</Link>
    </main>
  );
}
