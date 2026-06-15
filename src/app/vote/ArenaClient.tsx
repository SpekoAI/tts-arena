"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getLang,
  type PairResponse,
  type Verdict,
  type VoteResult,
} from "@/lib/types";

/** ms a clip must be played before voting is allowed. */
const MIN_PLAYED_MS = 1000;
/** how long to show the vendor/model reveal before loading the next pair. */
const REVEAL_MS = 1500;

/**
 * One on-screen side. `clip` is the blind label the voter sees ("A"/"B"); it
 * maps to a logical sample (`isA`) so we can record the left/right covariate
 * while keeping the audio assignment hidden.
 */
type Side = {
  /** logical identity: true if this side is the pair's sample A. */
  isA: boolean;
  sampleId: string;
  audioUrl: string;
};

type Phase = "loading" | "ready" | "revealed" | "error";

export default function ArenaClient({ lang }: { lang: string }) {
  const langMeta = getLang(lang);
  const rtl = !!langMeta?.rtl;

  const [phase, setPhase] = useState<Phase>("loading");
  const [pair, setPair] = useState<PairResponse | null>(null);
  /** left side then right side, after client-side A/B randomization. */
  const [sides, setSides] = useState<[Side, Side] | null>(null);
  const [reveal, setReveal] = useState<VoteResult["reveal"] | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const [voteCount, setVoteCount] = useState(0);

  // Per-pair mutable tracking that should not trigger re-renders.
  const playedRef = useRef({ a: 0, b: 0 });
  const playedFirstRef = useRef<"a" | "b" | null>(null);
  const pairReadyAtRef = useRef<number>(0);
  const submittingRef = useRef(false);

  // Played-enough gating drives the disabled state of vote buttons.
  const [playedA, setPlayedA] = useState(false);
  const [playedB, setPlayedB] = useState(false);

  const audioLeftRef = useRef<HTMLAudioElement | null>(null);
  const audioRightRef = useRef<HTMLAudioElement | null>(null);

  const loadPair = useCallback(async () => {
    setPhase("loading");
    setReveal(null);
    setPlayedA(false);
    setPlayedB(false);
    playedRef.current = { a: 0, b: 0 };
    playedFirstRef.current = null;

    try {
      const res = await fetch(`/api/pair?lang=${encodeURIComponent(lang)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`pair ${res.status}`);
      const data = (await res.json()) as PairResponse;

      // Randomize which logical sample lands on the left so position bias is
      // balanced and the leftWasA covariate carries real signal.
      const aSide: Side = { isA: true, sampleId: data.a.sampleId, audioUrl: data.a.audioUrl };
      const bSide: Side = { isA: false, sampleId: data.b.sampleId, audioUrl: data.b.audioUrl };
      const aOnLeft = Math.random() < 0.5;
      setSides(aOnLeft ? [aSide, bSide] : [bSide, aSide]);

      setPair(data);
      pairReadyAtRef.current = Date.now();
      setPhase("ready");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "failed to load pair");
      setPhase("error");
    }
  }, [lang]);

  useEffect(() => {
    void loadPair();
  }, [loadPair]);

  /** Accumulate played time for a logical clip and flip its "played enough" flag. */
  function onTimeUpdate(clip: "a" | "b", el: HTMLAudioElement) {
    // Track first-played order once.
    if (playedFirstRef.current === null && el.currentTime > 0) {
      playedFirstRef.current = clip;
    }
    // Approximate played-ms by current playhead (good enough for the gate).
    const ms = Math.floor(el.currentTime * 1000);
    if (ms > playedRef.current[clip]) playedRef.current[clip] = ms;
    if (clip === "a" && ms >= MIN_PLAYED_MS) setPlayedA(true);
    if (clip === "b" && ms >= MIN_PLAYED_MS) setPlayedB(true);
  }

  /** Pause the other clip so only one plays at a time. */
  function onPlay(which: "left" | "right") {
    const other = which === "left" ? audioRightRef.current : audioLeftRef.current;
    other?.pause();
  }

  async function submitVote(verdict: Verdict) {
    if (!pair || submittingRef.current || phase !== "ready") return;
    submittingRef.current = true;

    audioLeftRef.current?.pause();
    audioRightRef.current?.pause();

    const leftIsA = sides ? sides[0].isA : true;
    const body = {
      pairId: pair.pairId,
      verdict,
      rtMs: Date.now() - pairReadyAtRef.current,
      playedAMs: playedRef.current.a,
      playedBMs: playedRef.current.b,
      leftWasA: leftIsA,
      playedFirst: playedFirstRef.current,
    };

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`vote ${res.status}`);
      const data = (await res.json()) as VoteResult;

      setReveal(data.reveal);
      setVoteCount((n) => n + 1);
      setPhase("revealed");

      window.setTimeout(() => {
        submittingRef.current = false;
        void loadPair();
      }, REVEAL_MS);
    } catch (e) {
      submittingRef.current = false;
      setErrMsg(e instanceof Error ? e.message : "failed to submit vote");
      setPhase("error");
    }
  }

  const canVote = playedA && playedB && phase === "ready";

  return (
    <div className="flex flex-col" dir={rtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          {langMeta ? `${langMeta.flag} ${langMeta.nativeName}` : lang}
        </span>
        <Link
          href="/"
          className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
        >
          change language
        </Link>
      </div>

      {/* Prompt */}
      <div className="mt-4 min-h-[5rem] rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Both clips read this text
        </p>
        <p className="mt-2 text-lg leading-snug text-neutral-100">
          {phase === "loading" || !pair ? "…" : pair.promptText}
        </p>
      </div>

      {/* Play buttons */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        {(["left", "right"] as const).map((pos, idx) => {
          const side = sides?.[idx];
          const clip: "a" | "b" = side?.isA ? "a" : "b";
          const ref = pos === "left" ? audioLeftRef : audioRightRef;
          const enoughPlayed = clip === "a" ? playedA : playedB;
          const blindLabel = pos === "left" ? "A" : "B";
          return (
            <div key={pos} className="flex flex-col">
              <button
                type="button"
                disabled={!side || phase === "loading"}
                onClick={() => ref.current?.play()}
                className="flex min-h-[5rem] items-center justify-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 text-2xl font-semibold text-neutral-100 transition-colors hover:border-accent hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40"
              >
                <span aria-hidden>▶</span>
                <span>{blindLabel}</span>
              </button>
              <span className="mt-1 text-center text-[11px] text-neutral-600">
                {enoughPlayed ? "✓ heard" : "tap to listen"}
              </span>
              {side && (
                <audio
                  ref={ref}
                  src={side.audioUrl}
                  preload="auto"
                  onPlay={() => onPlay(pos)}
                  onTimeUpdate={(e) => onTimeUpdate(clip, e.currentTarget)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Vote buttons */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!canVote}
          onClick={() => submitVote(sides && sides[0].isA ? "a" : "b")}
          className="min-h-[3.5rem] rounded-2xl bg-accent px-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          🅰 A is better
        </button>
        <button
          type="button"
          disabled={!canVote}
          onClick={() => submitVote(sides && sides[0].isA ? "b" : "a")}
          className="min-h-[3.5rem] rounded-2xl bg-accent px-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          🅱 B is better
        </button>
      </div>
      <button
        type="button"
        disabled={!canVote}
        onClick={() => submitVote("tie")}
        className="mt-3 min-h-[2.75rem] rounded-2xl border border-neutral-800 px-4 text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Tie / Can&apos;t tell
      </button>

      {!canVote && phase === "ready" && (
        <p className="mt-3 text-center text-xs text-neutral-600">
          Play both clips for at least a second to unlock voting.
        </p>
      )}

      {/* Reveal overlay */}
      {phase === "revealed" && reveal && (
        <div className="mt-6 rounded-2xl border border-accent-muted bg-accent-muted/10 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-neutral-400">
            Reveal
          </p>
          <p className="mt-1 text-sm text-neutral-200">
            <span className="font-semibold text-neutral-100">A</span> ={" "}
            {reveal.a.vendor} {reveal.a.modelName}
            <span className="mx-2 text-neutral-600">·</span>
            <span className="font-semibold text-neutral-100">B</span> ={" "}
            {reveal.b.vendor} {reveal.b.modelName}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Loading next pair…</p>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/40 p-4 text-center">
          <p className="text-sm text-red-300">Something went wrong: {errMsg}</p>
          <button
            type="button"
            onClick={() => void loadPair()}
            className="mt-2 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700"
          >
            Retry
          </button>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-neutral-600">
        You&apos;ve voted {voteCount} {voteCount === 1 ? "time" : "times"} this
        session ·{" "}
        <Link href="/leaderboard" className="hover:text-neutral-300">
          see the leaderboard
        </Link>
      </p>
    </div>
  );
}
