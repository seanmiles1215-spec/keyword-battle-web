import { FormEvent, useState } from "react";

import type { AuthService } from "../lib/supabase";
import { humanizeSubmissionError } from "../lib/api";

export function AuthPage({ auth }: { auth: AuthService }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(action: "login" | "register", event?: FormEvent) {
    event?.preventDefault();
    if (!email.trim() || password.length < 8) {
      setStatus("请输入有效邮箱和至少 8 位密码。");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      if (action === "login") await auth.signIn(email.trim(), password);
      else await auth.signUp(email.trim(), password);
      setStatus(action === "login" ? "登录成功，正在进入…" : "注册已提交，请按邮箱提示完成验证。");
    } catch (error) {
      setStatus(humanizeSubmissionError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Keyword Battle Tool</p>
        <h1 id="auth-title">登录关键词分析</h1>
        <p className="lede">浏览器仅使用 Supabase 会话；每次 API 与 RPC 都会重新校验当前成员权限。</p>
        <form onSubmit={(event) => void submit("login", event)}>
          <label>
            邮箱
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button className="primary" type="submit" disabled={busy}>登录</button>
            <button type="button" disabled={busy} onClick={() => void submit("register")}>注册</button>
          </div>
        </form>
        {status ? <p className="notice" role="status">{status}</p> : null}
      </section>
    </main>
  );
}
