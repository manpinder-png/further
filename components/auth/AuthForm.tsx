"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/client/store";
import { IDENTITY_CHANGE_KEY, MODE_KEY, liveFetch } from "@/lib/client/live";
import { Logo } from "@/components/ui/bits";

const GOOGLE_ERRORS: Record<string, string> = {
  cognito_state: "We couldn't verify that sign-in attempt. Please start again.",
  cognito_expired: "That sign-in attempt expired. Please start again.",
  cognito_cancelled: "Sign-in was cancelled. You can try again or use your email and password.",
  cognito_invalid: "AWS sign-in couldn't be verified. Please try again.",
  cognito_account_exists: "An account already uses that email. Use its existing sign-in method. Linking sign-in methods is not available yet.",
  cognito_failed: "AWS sign-in couldn't finish. Please try again.",
  google_state: "We couldn't verify that sign-in attempt. Please start again.",
  google_expired: "That sign-in attempt expired. Please start again.",
  google_cancelled: "Google sign-in was cancelled. You can try again or use your email and password.",
  google_invalid: "Google sign-in couldn't be verified. Please try again.",
  google_account_exists: "An account already uses that email. Sign in with your existing password.",
  google_failed: "Google sign-in couldn't finish. Please try again.",
  google_not_configured: "Google sign-in needs one-time setup on this computer. You can create an email account now.",
};

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { auth, authReady } = useStore();
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [facebookStarting, setFacebookStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(GOOGLE_ERRORS[code] ?? "Sign-in couldn't finish. Please try again.");
  }, []);
  useEffect(() => { if (authReady && auth?.authenticated) window.location.replace("/"); }, [authReady, auth]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (signup && !emailConfirmed && !confirming && password !== confirm) { setError("The passwords don't match. Please check them."); return; }
    setBusy(true); setError(null);
    try {
      if (confirming) {
        const confirmation = await liveFetch("/api/auth/confirm", { method: "POST", body: JSON.stringify({ email: email.trim(), code }) });
        const result = await confirmation.json();
        if (!confirmation.ok || !result.confirmed) throw new Error(result.error ?? "Your email couldn't be verified. Please try again.");
        setEmailConfirmed(true); setConfirming(false); setCode("");
        setNotice("Email verified. Signing you in…");
      }
      let response = await liveFetch(`/api/auth/${signup && !emailConfirmed && !confirming ? "signup" : "login"}`, { method: "POST", body: JSON.stringify(signup && !emailConfirmed && !confirming ? { email: email.trim(), password, username: username.trim(), displayName: displayName.trim() } : { email: email.trim(), password }) });
      let result = await response.json();
      if (!response.ok && result.code === "EMAIL_CONFIRMATION_REQUIRED") { setConfirming(true); setNotice("Check your email for the verification code, or request a new one below."); setBusy(false); return; }
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "We couldn't sign you in. Please try again.");
      if (result.confirmationRequired) { setConfirming(true); setNotice(result.message ?? "Check your email for a verification code."); setBusy(false); return; }
      if (signup && !result.authenticated && result.confirmationRequired === false) {
        setEmailConfirmed(true);
        response = await liveFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) }); result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Please sign in with your new account.");
      }
      if (!result.authenticated) throw new Error("Sign-in wasn't confirmed. Please try again.");
      try { localStorage.setItem(MODE_KEY, "local"); localStorage.setItem(IDENTITY_CHANGE_KEY, String(Date.now())); } catch { /* other-tab notification is optional */ }
      window.location.assign("/");
    } catch (err) { setError(err instanceof Error ? err.message : "We couldn't sign you in. Please try again."); setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await liveFetch("/api/auth/resend", { method: "POST", body: JSON.stringify({ email: email.trim() }) }), result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The code couldn't be sent. Please try again.");
      setNotice("A new verification code was sent. Check your email.");
    } catch (error) { setError(error instanceof Error ? error.message : "The code couldn't be sent."); }
    finally { setBusy(false); }
  };
  const googleReady = auth?.providers.google.configured === true;
  const facebookReady = auth?.providers.facebook?.configured === true;
  const cognito = auth?.authProvider === "cognito";
  const creating = signup && !emailConfirmed;
  return <div className="scroll h-full px-5 py-8 sm:py-12"><div className="mx-auto grid max-w-4xl gap-10 md:grid-cols-[1fr_420px] md:gap-16">
    <div className="hidden pt-10 md:block"><Logo size={35} /><p className="mt-8 text-sm text-mastery">Your next idea starts here.</p><h1 className="mt-3 text-[40px] font-semibold leading-[1.1] tracking-tight">Keep your questions.<br />Grow your understanding.</h1><p className="mt-5 max-w-sm text-base leading-relaxed text-muted">A place for the ideas you want to explore, the progress you make, and the people you learn with.</p><div className="mt-9 border-l-2 border-mastery/40 pl-4 text-sm leading-relaxed text-muted">{cognito ? "Your account and learning records use the shared AWS workspace." : "Your learning data stays on this machine."} AI requests go to the configured Meta model services.</div></div>
    <section className="rounded-2xl border border-line bg-panel p-5 sm:p-7" aria-labelledby="auth-title"><h2 id="auth-title" className="text-2xl font-semibold">{confirming ? "Verify your email" : creating ? "Create your account" : "Welcome back"}</h2><p className="mt-2 text-sm text-muted">{confirming ? `Enter the six-digit code sent to ${email}.` : creating ? "One account for your questions and conversations." : "Pick up where your curiosity left off."}</p>
      {!confirming && facebookReady && <><a href="/api/auth/cognito/start?provider=Facebook" onClick={event => { if (facebookStarting) event.preventDefault(); else setFacebookStarting(true); }} aria-busy={facebookStarting} className="btn mt-6 min-h-12 w-full rounded-lg bg-panel-2"><span className="text-base font-semibold" aria-hidden>f</span> {facebookStarting ? "Connecting to Facebook…" : "Continue with Facebook"}</a>{facebookStarting && <p className="mt-3 text-sm text-muted" role="status">Starting your secure sign-in. This can take a moment.</p>}<div className="my-5 flex items-center gap-3 text-xs text-dim"><span className="h-px flex-1 bg-line" />or use email<span className="h-px flex-1 bg-line" /></div></>}
      {!confirming && googleReady && <><a href="/api/auth/google/start" className="btn mt-6 min-h-12 w-full rounded-lg bg-panel-2"><span className="text-base font-semibold" aria-hidden>G</span> Continue with Google</a><div className="my-5 flex items-center gap-3 text-xs text-dim"><span className="h-px flex-1 bg-line" />or use email<span className="h-px flex-1 bg-line" /></div></>}
      <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
        {creating && !confirming && <><Field label="Your name" id="display-name"><input id="display-name" className="field rounded-lg" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength={60} minLength={1} required disabled={busy} /></Field><Field label="Username" id="username"><input id="username" className="field rounded-lg" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} autoComplete="username" minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" required disabled={busy} aria-describedby="username-hint" /><p id="username-hint" className="mt-1.5 text-xs text-dim">3–24 lowercase letters, numbers or underscores.</p></Field></>}
        {!confirming && <><Field label="Email" id="email"><input id="email" className="field rounded-lg" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={busy} /></Field>
        <Field label="Password" id="password"><input id="password" className="field rounded-lg" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 12 : 1} maxLength={128} required disabled={busy} aria-describedby={creating ? "password-hint" : undefined} />{creating && <p id="password-hint" className="mt-1.5 text-xs text-dim">{cognito ? "At least 12 characters, with uppercase, lowercase and a number." : "At least 12 characters. A few memorable words work well."}</p>}</Field>
        {creating && <Field label="Confirm password" id="confirm-password"><input id="confirm-password" className="field rounded-lg" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /></Field>}</>}
        {confirming && <Field label="Verification code" id="verification-code"><input id="verification-code" className="field rounded-lg" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} pattern="[0-9]{6}" required disabled={busy} /></Field>}
        {notice && <p className="text-sm leading-relaxed text-mastery" role="status">{notice}</p>}
        {error && <p className="rounded-lg border border-err/30 bg-err/5 p-3 text-sm text-err" role="alert">{error}</p>}
        <button className="btn btn-primary min-h-12 w-full rounded-lg" disabled={busy}>{busy ? confirming ? "Verifying your email…" : creating ? "Creating your account…" : "Signing in…" : confirming ? "Verify and sign in" : creating ? "Create account" : "Sign in"}</button>
        {confirming && <div className="flex justify-between gap-3 text-xs"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void resend()}>Send a new code</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setConfirming(false); setCode(""); setError(null); setNotice(null); }}>Change email</button></div>}
      </form>
      <p className="mt-5 text-center text-sm text-muted">{signup ? "Already have an account?" : "New to Further?"} <Link href={signup ? "/login" : "/signup"} className="ml-1 text-text underline underline-offset-4">{signup ? "Sign in" : "Create an account"}</Link></p>
      <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">{cognito ? "Your sign-in is managed by Amazon Cognito. Your learning profile stays separate from your password. Social sign-in shares basic profile information only." : signup ? "This creates an account in the local Further app. It doesn't create a Google account or give Further access to your inbox." : "Google sign-in only shares your basic profile. Further doesn't request access to Gmail messages."}</p>
    </section>
  </div></div>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div><label className="mb-2 block text-sm text-muted" htmlFor={id}>{label}</label>{children}</div>; }
