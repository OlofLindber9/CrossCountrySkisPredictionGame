"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      await fetch("/api/profile", { method: "POST" });
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="page-dark">
      {/* Background athlete image (optional) */}
      <div className="hero-bg-image opacity-20 mix-blend-luminosity" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "rgba(5,14,26,0.65)" }}
      />

      <div 
        className="absolute inset-0 z-0 opacity-25 mix-blend-luminosity"
        style={{
          backgroundImage: "url('/images/klaebo winner.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "40% center", // Shifts image slightly left
          backgroundRepeat: "no-repeat"
        }}
      />

      {/* Gold top accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: "linear-gradient(90deg, transparent, #e8a020 30%, #f5c842 60%, transparent)",
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        {/* Back to landing */}
        <Link
          href="/"
          className="absolute top-5 left-5 text-white/40 hover:text-white/70 text-sm font-medium transition-colors flex items-center gap-1"
        >
          ← Home
        </Link>

        {/* Card */}
        <div className="glass-card w-full max-w-sm animate-scale-in">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">⛷️</div>
            <h1
              className="text-white text-3xl font-black uppercase"
              style={{ fontFamily: "var(--font-barlow), 'Barlow Condensed', sans-serif" }}
            >
              Welcome back
            </h1>
            <p className="text-white/45 text-sm mt-1">Log in to Ski Predictor</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-dark"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-red-300 text-sm bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-ski-midnight text-sm tracking-wide transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading
                  ? "rgba(232,160,32,0.5)"
                  : "linear-gradient(135deg, #f5c842, #e8a020)",
                fontFamily: "var(--font-barlow), sans-serif",
                letterSpacing: "0.05em",
              }}
            >
              {loading ? "Logging in…" : "LOG IN"}
            </button>
          </form>

          <p className="text-center text-white/35 text-sm mt-5">
            No account?{" "}
            <Link href="/signup" className="text-ski-accent hover:text-ski-gold font-semibold transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
