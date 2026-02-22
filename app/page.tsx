import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="page-dark relative overflow-hidden">
      {/*
       * Hero background image — drop a photo of a ski athlete at:
       *   public/images/hero-bg.jpg
       * The gradient overlay keeps text readable regardless of the image.
       */}
      <div 
        className="absolute inset-0 z-0 opacity-25 mix-blend-luminosity"
        style={{
          backgroundImage: "url('/images/Frida.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "40% center", // Shifts image slightly left
          backgroundRepeat: "no-repeat"
        }}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(5,14,26,0.6) 0%, rgba(5,14,26,0.25) 45%, rgba(5,14,26,0.88) 100%)",
        }}
      />

      {/* Animated speed lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="speed-line w-3/4" style={{ top: "28%", animationDelay: "0s" }} />
        <div
          className="speed-line w-1/2"
          style={{ top: "40%", animationDelay: "0.9s", opacity: 0.4 }}
        />
        <div
          className="speed-line w-2/3"
          style={{ top: "57%", animationDelay: "1.8s", opacity: 0.3 }}
        />
      </div>

      {/* Gold accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: "linear-gradient(90deg, transparent, #e8a020 30%, #f5c842 60%, transparent)",
        }}
      />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col min-h-screen px-4">
        {/* Top nav strip */}
        <div className="flex justify-between items-center max-w-5xl mx-auto w-full py-5">
          <span className="text-white/60 font-bold tracking-widest text-xs uppercase">
            &nbsp;&nbsp;FIS Cross-Country
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-white/60 hover:text-white text-sm font-semibold transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="btn-ghost text-sm px-4 py-1.5 rounded-xl"
            >
              Sign up free
            </Link>
          </div>
        </div>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-3xl mx-auto w-full pb-12">
          {/* Season chip */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-ski-accent/40 text-ski-accent text-xs font-bold tracking-widest uppercase mb-8 animate-slide-down"
            style={{ background: "rgba(232,160,32,0.1)" }}
          >
            &nbsp;&nbsp;2025 / 26 World Cup Season
          </div>

          {/* Title */}
          <h1
            className="text-white uppercase leading-none mb-5 animate-fade-in"
            style={{
              fontFamily: "var(--font-barlow), 'Barlow Condensed', Impact, sans-serif",
              fontSize: "clamp(4.5rem, 13vw, 9.5rem)",
              fontWeight: 900,
              letterSpacing: "-0.025em",
            }}
          >
            <span className="gradient-text-light">Ski</span>
            <br />
            Predictor
          </h1>

          {/* Subtitle */}
          <p
            className="text-ski-ice/75 text-lg sm:text-xl max-w-lg mx-auto mb-10 anim-ready animate-slide-up"
          >
            Challenge your friends. Predict the podiums. Conquer the{" "}
            <span className="text-ski-accent font-semibold">FIS World Cup</span> leaderboard.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-4 justify-center anim-ready animate-slide-up-1">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 font-bold px-8 py-3.5 rounded-2xl text-ski-midnight text-base shadow-2xl transition-all duration-200 hover:-translate-y-1 animate-pulse-gold"
              style={{
                background: "linear-gradient(135deg, #f5c842, #e8a020)",
                fontFamily: "var(--font-barlow), sans-serif",
                letterSpacing: "0.02em",
              }}
            >
              Get started →
            </Link>
            <Link href="/login" className="btn-ghost px-8 py-3.5 text-base rounded-2xl">
              Log in
            </Link>
          </div>
        </div>

        

        {/* Footer */}
        <div className="border-t border-white/10 py-4 text-center text-white/25 text-xs">
          Powered by FIS official data &middot; Not affiliated with FIS
        </div>
      </div>
    </main>
  );
}
