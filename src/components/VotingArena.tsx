"use client";

/**
 * VotingArena — the inline, single-page voting experience.
 *
 * Two blind clips, each rendered as a live audio-reactive {@link VoiceSphere}.
 * Play with a tap or the spacebar; vote with the arrow keys. ~1 in 4 rounds
 * hides a real human — the reveal calls it out ("spot the human"). Uses the
 * existing /api/pair and /api/vote endpoints; works in demo mode.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import VoiceSphere from "./VoiceSphere";
import Icon from "./Icon";
import ProviderMark from "./ProviderMark";
import {
  FAILURE_REASONS,
  type FailureReason,
  type PairResponse,
  type Verdict,
  type VoteResult,
} from "@/lib/types";

const MIN_PLAYED_MS = 800;
const REVEAL_MS = 6500; // longer reveal so there's time to tag what was off

type Phase = "loading" | "ready" | "revealed" | "error";
type Side = { isA: boolean; audioUrl: string };

const CATEGORY_LABEL: Record<string, string> = {
  conversational: "Conversational",
  news: "News",
  narration: "Narration",
  hard: "Hard text",
};

export default function VotingArena({ lang = "en" }: { lang?: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [pair, setPair] = useState<PairResponse | null>(null);
  const [sides, setSides] = useState<[Side, Side] | null>(null);
  const [reveal, setReveal] = useState<VoteResult["reveal"] | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [heard, setHeard] = useState<[boolean, boolean]>([false, false]);
  const [playing, setPlaying] = useState<0 | 1 | null>(null);
  const [analysers, setAnalysers] = useState<[AnalyserNode | null, AnalyserNode | null]>([null, null]);
  const [pickedSlot, setPickedSlot] = useState<0 | 1 | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [humanSeen, setHumanSeen] = useState(0);
  const [humanSpotted, setHumanSpotted] = useState(0);
  const [reasonTag, setReasonTag] = useState<FailureReason | null>(null);

  const audioRefs = useRef<(HTMLAudioElement | null)[]>([null, null]);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRefs = useRef<(MediaElementAudioSourceNode | null)[]>([null, null]);
  const analyserRefs = useRef<(AnalyserNode | null)[]>([null, null]);
  const playedMs = useRef({ a: 0, b: 0 });
  const playedFirst = useRef<"a" | "b" | null>(null);
  const pairReadyAt = useRef(0);
  const submitting = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPair = useCallback(async () => {
    setPhase("loading");
    setReveal(null);
    setPickedSlot(null);
    setReasonTag(null);
    setHeard([false, false]);
    setPlaying(null);
    playedMs.current = { a: 0, b: 0 };
    playedFirst.current = null;
    audioRefs.current.forEach((el) => el?.pause());
    try {
      const res = await fetch(`/api/pair?lang=${encodeURIComponent(lang)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`pair ${res.status}`);
      const data = (await res.json()) as PairResponse;
      const aOnLeft = Math.random() < 0.5;
      const aSide: Side = { isA: true, audioUrl: data.a.audioUrl };
      const bSide: Side = { isA: false, audioUrl: data.b.audioUrl };
      setSides(aOnLeft ? [aSide, bSide] : [bSide, aSide]);
      setPair(data);
      pairReadyAt.current = Date.now();
      setPhase("ready");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "failed to load");
      setPhase("error");
    }
  }, [lang]);

  useEffect(() => {
    void loadPair();
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      void ctxRef.current?.close();
    };
  }, [loadPair]);

  const ensureAudioGraph = useCallback((slot: 0 | 1) => {
    const el = audioRefs.current[slot];
    if (!el) return;
    if (!ctxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    const ctx = ctxRef.current;
    if (!srcRefs.current[slot]) {
      try {
        const source = ctx.createMediaElementSource(el);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        srcRefs.current[slot] = source;
        analyserRefs.current[slot] = analyser;
        setAnalysers((prev) => {
          const next: [AnalyserNode | null, AnalyserNode | null] = [...prev] as [
            AnalyserNode | null,
            AnalyserNode | null,
          ];
          next[slot] = analyser;
          return next;
        });
      } catch {
        // MediaElementSource already exists or unsupported — ignore.
      }
    }
  }, []);

  const play = useCallback(
    (slot: 0 | 1) => {
      ensureAudioGraph(slot);
      void ctxRef.current?.resume();
      const other = slot === 0 ? 1 : 0;
      audioRefs.current[other]?.pause();
      const el = audioRefs.current[slot];
      if (!el) return;
      void el.play().catch(() => {});
      setPlaying(slot);
    },
    [ensureAudioGraph],
  );

  const onTimeUpdate = (slot: 0 | 1) => {
    const el = audioRefs.current[slot];
    const s = sides?.[slot];
    if (!el || !s) return;
    const clip: "a" | "b" = s.isA ? "a" : "b";
    if (playedFirst.current === null && el.currentTime > 0) {
      playedFirst.current = clip;
    }
    const ms = Math.floor(el.currentTime * 1000);
    if (ms > playedMs.current[clip]) playedMs.current[clip] = ms;
    if (ms >= MIN_PLAYED_MS && !heard[slot]) {
      setHeard((prev) => {
        if (prev[slot]) return prev;
        const next: [boolean, boolean] = [prev[0], prev[1]];
        next[slot] = true;
        return next;
      });
    }
  };

  const canVote =
    phase === "ready" && heard[0] && heard[1] && !submitting.current;

  const submit = useCallback(
    async (choice: "left" | "right" | "tie") => {
      if (!pair || !sides || submitting.current || phase !== "ready") return;
      if (!heard[0] || !heard[1]) return;
      submitting.current = true;
      audioRefs.current.forEach((el) => el?.pause());

      const verdict: Verdict =
        choice === "tie"
          ? "tie"
          : choice === "left"
            ? sides[0].isA
              ? "a"
              : "b"
            : sides[1].isA
              ? "a"
              : "b";
      setPickedSlot(choice === "left" ? 0 : choice === "right" ? 1 : null);

      try {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pairId: pair.pairId,
            verdict,
            rtMs: Date.now() - pairReadyAt.current,
            playedAMs: playedMs.current.a,
            playedBMs: playedMs.current.b,
            leftWasA: sides[0].isA,
            playedFirst: playedFirst.current,
          }),
        });
        if (!res.ok) throw new Error(`vote ${res.status}`);
        const data = (await res.json()) as VoteResult;
        setReveal(data.reveal);
        setVoteCount((n) => n + 1);

        const humanIsA = data.reveal.a.isHuman;
        const humanIsB = data.reveal.b.isHuman;
        if (humanIsA || humanIsB) {
          setHumanSeen((n) => n + 1);
          const humanSlot = sides[0].isA
            ? humanIsA
              ? 0
              : 1
            : humanIsA
              ? 1
              : 0;
          if (
            (choice === "left" && humanSlot === 0) ||
            (choice === "right" && humanSlot === 1)
          ) {
            setHumanSpotted((n) => n + 1);
          }
        }

        setPhase("revealed");
        advanceTimer.current = setTimeout(() => {
          submitting.current = false;
          void loadPair();
        }, REVEAL_MS);
      } catch (e) {
        submitting.current = false;
        setErrMsg(e instanceof Error ? e.message : "vote failed");
        setPhase("error");
      }
    },
    [pair, sides, phase, heard, loadPair],
  );

  // Spacebar cycles playback; arrow keys vote.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " ") {
        e.preventDefault();
        if (phase !== "ready" && phase !== "revealed") return;
        if (playing === null) play(0);
        else if (playing === 0) play(1);
        else audioRefs.current[1]?.pause();
        return;
      }
      if (phase !== "ready") return;
      if (e.key === "ArrowLeft") submit("left");
      else if (e.key === "ArrowRight") submit("right");
      else if (e.key === "t" || e.key === "T") submit("tie");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, playing, play, submit]);

  const revealFor = (slot: 0 | 1) => {
    if (!reveal || !sides) return null;
    return sides[slot].isA ? reveal.a : reveal.b;
  };
  const humanPair = !!reveal && (reveal.a.isHuman || reveal.b.isHuman);
  const pickedHuman =
    humanPair && pickedSlot !== null && revealFor(pickedSlot)?.isHuman;

  // Tagging is offered on any non-tie vote. We critique the voice not chosen;
  // if that turns out to be the human, we critique the chosen AI instead — so
  // there's always an AI to give feedback on (and never "critique a human").
  let critiqueSlot: 0 | 1 | null =
    pickedSlot === null ? null : pickedSlot === 0 ? 1 : 0;
  let critique = critiqueSlot !== null ? revealFor(critiqueSlot) : null;
  if (critique?.isHuman && pickedSlot !== null) {
    critiqueSlot = pickedSlot;
    critique = revealFor(pickedSlot);
  }
  const canTag = pickedSlot !== null && !!critique && !critique.isHuman;

  const submitReason = (reason: FailureReason) => {
    if (!pair || !critique) return;
    setReasonTag(reason);
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairId: pair.pairId,
        systemId: critique.systemId,
        reason,
      }),
    }).catch(() => {});
  };

  return (
    <div className="card overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between border-b border-hair px-5 py-3">
        <span className="label">
          {pair?.category ? CATEGORY_LABEL[pair.category] ?? "Listen & vote" : "Listen & vote"}
        </span>
        <span className="num text-[12px] text-ink-muted">
          {voteCount} voted
          {humanSeen > 0 && (
            <>
              {"  ·  "}
              <span
                className="text-human-deep"
                title="Some rounds secretly include a real human. This is how many of those you caught by picking the human."
              >
                caught {humanSpotted}/{humanSeen} hidden humans
              </span>
            </>
          )}
        </span>
      </div>

      {/* prompt */}
      <div className="px-5 pt-5 text-center">
        <p className="text-[11px] uppercase tracking-label text-ink-faint">
          Both voices read
        </p>
        <p className="mx-auto mt-2 max-w-xl text-lg font-medium leading-snug text-ink">
          {phase === "loading" || !pair ? "…" : `“${pair.promptText}”`}
        </p>
      </div>

      {/* the two spheres */}
      <div className="grid grid-cols-2 gap-3 p-5 sm:gap-5">
        {([0, 1] as const).map((slot) => {
          const r = revealFor(slot);
          const picked = pickedSlot === slot;
          const orbColor = slot === 0 ? "#2563EB" : "#8B5CF6";
          const orbSeed = slot === 0 ? 0 : 2.4; // different seed → asynchronous motion
          return (
            <div className="flex flex-col items-center py-2" key={slot}>
              <button
                type="button"
                onClick={() => (playing === slot ? audioRefs.current[slot]?.pause() : play(slot))}
                disabled={phase === "loading"}
                className={`group relative grid aspect-square w-full max-w-[168px] place-items-center rounded-full transition-transform active:scale-95 ${
                  picked ? "ring-2 ring-accent ring-offset-4 ring-offset-card" : ""
                }`}
                aria-label={`Play voice ${slot === 0 ? "one" : "two"}`}
              >
                <VoiceSphere
                  analyser={analysers[slot]}
                  color={orbColor}
                  seed={orbSeed}
                  className="absolute inset-0"
                />
                <span
                  className={`absolute inset-0 m-auto grid h-11 w-11 place-items-center rounded-full bg-ink/85 text-white backdrop-blur transition-opacity ${
                    playing === slot ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                  }`}
                >
                  <Icon name={playing === slot ? "pause" : "play"} className="text-lg" />
                </span>
              </button>

              <div className="mt-2 flex h-6 items-center gap-1.5 text-[13px]">
                {phase === "revealed" && r ? (
                  r.isHuman ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-human-soft px-2.5 py-0.5 font-semibold text-human-deep">
                      <Icon name="star" /> Real human
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                      <ProviderMark vendor={r.vendor} className="h-5 w-5 text-[9px]" />
                      {r.vendor}{" "}
                      <span className="text-ink-muted">{r.modelName}</span>
                    </span>
                  )
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 ${heard[slot] ? "text-win" : "text-ink-faint"}`}
                  >
                    {heard[slot] ? (
                      <>
                        <Icon name="check" /> heard
                      </>
                    ) : (
                      `Voice ${slot === 0 ? "1" : "2"}`
                    )}
                  </span>
                )}
              </div>

              <audio
                ref={(el) => {
                  audioRefs.current[slot] = el;
                }}
                src={sides?.[slot]?.audioUrl}
                crossOrigin="anonymous"
                preload="auto"
                onPlay={() => setPlaying(slot)}
                onPause={() => setPlaying((p) => (p === slot ? null : p))}
                onEnded={() => setPlaying((p) => (p === slot ? null : p))}
                onTimeUpdate={() => onTimeUpdate(slot)}
              />
            </div>
          );
        })}
      </div>

      {/* reveal banner or vote controls */}
      {phase === "revealed" && reveal ? (
        <div className="border-t border-hair px-5 py-4 text-center">
          {humanPair ? (
            <p className="text-[15px] font-semibold text-ink">
              {pickedHuman ? (
                <>You spotted the human. Sharp ears.</>
              ) : pickedSlot === null ? (
                <>One of these was a real person.</>
              ) : (
                <>Fooled — that was the AI. One voice was a real person.</>
              )}
            </p>
          ) : (
            <p className="text-[15px] font-semibold text-ink">
              Both were AI. {pickedSlot !== null ? "Nice pick." : "Called it a tie."}
            </p>
          )}
          {reveal.crowd && (
            <p className="num mt-1 text-[12px] text-ink-muted">
              {humanPair && reveal.crowd.humanPreferredPct !== undefined
                ? `${Math.round(reveal.crowd.humanPreferredPct * 100)}% of ${reveal.crowd.votes.toLocaleString()} listeners preferred the human`
                : `${Math.round(reveal.crowd.agreePct * 100)}% of ${reveal.crowd.votes.toLocaleString()} listeners agreed with you`}
            </p>
          )}

          {canTag && critique && (
            <div className="mt-3.5 border-t border-hair pt-3.5">
              <p className="text-[12px] text-ink-muted">
                {reasonTag ? (
                  <>
                    Thanks — noted for{" "}
                    <span className="font-medium text-ink">{critique.vendor}</span>.
                  </>
                ) : (
                  <>
                    What was off about{" "}
                    <span className="font-medium text-ink">{critique.vendor}</span>?{" "}
                    <span className="text-ink-faint">(optional)</span>
                  </>
                )}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {FAILURE_REASONS.map((rr) => (
                  <button
                    key={rr.key}
                    type="button"
                    onClick={() => submitReason(rr.key)}
                    aria-pressed={reasonTag === rr.key}
                    className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                      reasonTag === rr.key
                        ? "border-accent bg-accent text-white"
                        : "border-hair-strong text-ink-soft hover:border-ink/25 hover:text-ink"
                    }`}
                  >
                    {rr.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (advanceTimer.current) clearTimeout(advanceTimer.current);
              submitting.current = false;
              void loadPair();
            }}
            className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Next round <Icon name="arrow-right" />
          </button>
        </div>
      ) : (
        <div className="border-t border-hair px-5 py-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2.5">
            <button
              type="button"
              disabled={!canVote}
              onClick={() => submit("left")}
              className="flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-hair disabled:text-ink-faint"
            >
              <Icon name="arrow-left" /> Voice 1
            </button>
            <button
              type="button"
              disabled={!canVote}
              onClick={() => submit("tie")}
              className="rounded-xl border border-hair-strong px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:border-ink/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Tie
            </button>
            <button
              type="button"
              disabled={!canVote}
              onClick={() => submit("right")}
              className="flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-hair disabled:text-ink-faint"
            >
              Voice 2 <Icon name="arrow-right" />
            </button>
          </div>
          <p className="mt-3 text-center text-[12px] text-ink-faint">
            {canVote ? (
              <>
                Which sounds more human?{" "}
                <span className="num">←</span> /{" "}
                <span className="num">→</span> to vote ·{" "}
                <span className="num">space</span> to play
              </>
            ) : (
              <>Play both voices to unlock voting · <span className="num">space</span> to play</>
            )}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="border-t border-hair px-5 py-4 text-center">
          <p className="text-sm text-danger">Something went wrong: {errMsg}</p>
          <button
            type="button"
            onClick={() => void loadPair()}
            className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-sm text-white"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
