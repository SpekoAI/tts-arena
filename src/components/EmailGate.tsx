"use client";

/**
 * EmailGate — gates its children behind an email capture (lead-gen).
 *
 * Frontend-complete: validates the email, posts to /api/subscribe, then unlocks
 * and remembers the unlock in localStorage so returning visitors skip the gate.
 * The actual lead delivery is wired server-side later.
 */

import { useEffect, useState, type FormEvent } from "react";
import Icon from "./Icon";

const KEY = "tts_report_unlocked";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PERKS = [
  "The full methodology, in plain language",
  "All 13 voices with per-category breakdowns",
  "The naturalness-vs-latency dataset",
  "An email when the ranking updates",
];

export default function EmailGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setUnlocked(true);
    } catch {
      /* ignore */
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setErr("Please enter a valid email.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErr("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) throw new Error("failed");
      try {
        localStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
      setUnlocked(true);
    } catch {
      setStatus("error");
      setErr("Something went wrong — please try again.");
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="card mx-auto max-w-xl overflow-hidden">
      <div className="border-b border-hair bg-canvas-deep px-6 py-5 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon name="lock" className="text-xl" />
        </span>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-ink">
          Get the full 2026 humanness report
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-soft">
          Enter your email to read the complete methodology and unlock the full
          results.
        </p>
      </div>

      <div className="px-6 py-6">
        <ul className="mb-5 space-y-2.5">
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[14px] text-ink-soft">
              <span className="mt-0.5 text-accent">
                <Icon name="check" />
              </span>
              {p}
            </li>
          ))}
        </ul>

        <form onSubmit={onSubmit} className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder="you@company.com"
            aria-label="Email address"
            className="min-w-0 flex-1 rounded-xl border border-hair-strong bg-card px-4 py-3 text-[15px] text-ink outline-none transition-shadow placeholder:text-ink-faint focus:border-accent focus:shadow-ring"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {status === "loading" ? "Unlocking…" : "Unlock the report"}
            {status !== "loading" && <Icon name="arrow-right" />}
          </button>
        </form>
        {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}
        <p className="mt-3 text-[12px] text-ink-faint">
          No spam — just the report and the occasional update. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
