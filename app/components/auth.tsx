"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    async function initialize() {
      try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
          throw new Error("Supabase is not configured. Set the public URL and publishable key, then restart the app.");
        }
        const supabase = createClient();
        setClient(supabase);
        let changed = false;
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          changed = true;
          if (active) { setUser(session?.user ?? null); setLoading(false); }
        });
        unsubscribe = () => data.subscription.unsubscribe();
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (active && !changed) {
          setUser(auth.user);
          if (authError && authError.name !== "AuthSessionMissingError") setError(authError.message);
        }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Unable to load authentication"); }
      finally { if (active) setLoading(false); }
    }
    void initialize();
    return () => { active = false; unsubscribe(); };
  }, []);
  return { user, client, loading, error };
}

export function AuthForm({ client }: { client: SupabaseClient | null }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!client || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const credentials = { email: email.trim(), password };
      const result = signup ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      setPassword("");
      if (signup && !result.data.session) setMessage("Check your email to confirm your account, then sign in.");
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed"); }
    finally { pending.current = false; setBusy(false); }
  }
  async function guestLogin() {
    if (!client || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guest login failed");
    } finally {
      pending.current = false; setBusy(false);
    }
  }
  return <form className="auth-card" onSubmit={submit} aria-busy={busy}>
    <h2>{signup ? "Create an account" : "Sign in to Lost Signal"}</h2>
    <p className="note">{signup ? "Create an account to post reports and manage claims." : "Welcome back. Your campus finds are waiting."}</p>
    <label className="field">Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="field">Password<input type="password" required autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} /></label>
    {error && <p className="err" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button className="big" disabled={!client || busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
    <div className="guest-separator">or explore first</div>
    <button type="button" className="btn2" disabled={!client || busy} onClick={guestLogin}>Continue as guest</button>
    <button type="button" className="auth-switch" disabled={busy} onClick={() => { setSignup(!signup); setError(""); setMessage(""); }}>
      {signup ? "Already have an account? Sign in" : "New here? Create an account"}
    </button>
  </form>;
}
