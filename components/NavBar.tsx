"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

interface NavBarProps {
  user: { email: string; displayName: string };
}

export default function NavBar({ user }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: "🏠︎" },
    { href: "/races", label: "Races", icon: "🏁" },
    { href: "/groups", label: "My Groups", icon: "𖨆𖨆" },
  ];

  return (
    <nav
      className="sticky top-0 z-50 text-white shadow-lg border-b border-white/10"
      style={{
        background: "rgba(13, 31, 53, 0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {/* Gold accent top line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background:
            "linear-gradient(90deg, transparent, #e8a020 30%, #f5c842 60%, transparent)",
        }}
      />

      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-black text-lg tracking-tight"
          style={{ fontFamily: "var(--font-barlow), 'Barlow Condensed', sans-serif" }}
        >
          <span className="text-xl">⛷️</span>
          <span className="hidden sm:inline">
            <span className="text-ski-accent">Ski</span>
            <span className="text-white"> Predictor</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden sm:flex items-center gap-1">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  active ? "text-white" : "text-white/50 hover:text-white hover:bg-white/8"
                }`}
              >
                {active && (
                  <span
                    className="absolute inset-0 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.1)" }}
                  />
                )}
                <span className="relative">{l.label}</span>
                {active && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
                    style={{ background: "linear-gradient(90deg, #e8a020, #f5c842)" }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: "linear-gradient(135deg, #f5c842, #e8a020)",
                color: "#0d1f35",
              }}
            >
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <span className="text-white/55 text-sm">{user.displayName}</span>
          </div>

          <a
            href="mailto:ololin0725@gmail.com?subject=Ski%20Predictor%20Feedback"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-ski-accent transition-colors font-medium border border-white/15 px-3 py-1 rounded-lg hover:border-ski-accent/50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Feedback
          </a>

          <button
            onClick={handleLogout}
            className="text-xs text-white/40 hover:text-white/75 transition-colors font-medium border border-white/15 px-3 py-1 rounded-lg hover:border-white/30"
          >
            Log out
          </button>

          {/* Mobile menu toggle */}
          <button
            className="sm:hidden p-1 text-white/55 hover:text-white transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div
          className="sm:hidden border-t border-white/10 px-4 pb-4 pt-2 flex flex-col gap-1"
          style={{ background: "rgba(13, 31, 53, 0.98)" }}
        >
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  active ? "text-white bg-white/10" : "text-white/50 hover:text-white hover:bg-white/8"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                <span>{l.icon}</span>
                {l.label}
                {active && (
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ background: "#e8a020" }}
                  />
                )}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between px-3">
            <span className="text-white/35 text-xs">{user.displayName}</span>
            <div className="flex items-center gap-3">
              <a
                href="mailto:ololin0725@gmail.com?subject=Ski%20Predictor%20Feedback"
                className="text-xs text-white/35 hover:text-ski-accent transition-colors"
              >
                Feedback
              </a>
              <button
                onClick={handleLogout}
                className="text-xs text-white/35 hover:text-white transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
