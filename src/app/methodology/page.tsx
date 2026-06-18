import Link from "next/link";
import Icon from "@/components/Icon";
import EmailGate from "@/components/EmailGate";

export const metadata = {
  title: "Methodology & report — TTS Arena",
  description:
    "How the arena turns anonymous blind votes into a humanness ranking: Bradley-Terry with bootstrap confidence intervals, measured against a real human baseline.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hair py-7 first:border-0">
      <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <p className="label">Methodology &amp; report</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        How the ranking works
      </h1>
      <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-soft">
        A plain-language account of how anonymous taps become a humanness
        ranking — and the honest limits of what it means. The full write-up and
        the complete 2026 results are below.
      </p>

      <div className="mt-10">
        <EmailGate>
          <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-accent/30 bg-accent-soft px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-card text-accent">
                <Icon name="download" className="text-lg" />
              </span>
              <p className="text-[14px] text-ink-soft">
                The full PDF report is on its way to your inbox.
              </p>
            </div>
            <Link
              href="/leaderboard"
              className="shrink-0 text-sm font-semibold text-accent hover:text-accent-hover"
            >
              See the data →
            </Link>
          </div>

          <Section title="Blind A/B preference">
            <p>
              Each round shows the prompt text and two clips, A and B, rendered
              by two <em>different</em> systems from the <em>same</em> text. You
              play both and pick which sounds more human — or Tie. Vendor and
              model names stay hidden until the moment after your vote lands.
            </p>
            <p>
              Sides are randomized, and both which side was A and which clip
              played first are recorded, so position- and order-bias can be
              measured and corrected. Voting unlocks only once both clips have
              actually played.
            </p>
          </Section>

          <Section title="Humanness, measured against a real human">
            <p>
              A real human recording is mixed into the arena as a hidden system.
              A voice&apos;s <span className="text-human-deep">humanness</span> is
              how it fares against that human: when listeners pick it over the
              human about half the time, it is statistically indistinguishable —
              humanness 100. Nothing scores above 100.
            </p>
          </Section>

          <Section title="Bradley-Terry ranking with bootstrap intervals">
            <p>
              All ranking-eligible votes are fit with a Bradley-Terry
              maximum-likelihood model (Hunter&apos;s MM, ties split evenly), on
              an Elo-style scale. Each voice gets a 95% percentile-bootstrap
              confidence interval.
            </p>
            <p>
              <span className="font-medium text-ink">A higher score is not
              automatically a win.</span>{" "}
              Two voices are distinguishable only when their intervals
              don&apos;t overlap. A voice stays provisional until it has enough
              votes.
            </p>
          </Section>

          <Section title="Fair by construction">
            <p>
              Both sides of a pair read the same prompt, and which side is shown
              left/right is randomized — so the comparison is voice-vs-voice,
              never script-vs-script or position-vs-position.
            </p>
            <p>
              Loudness normalization to a common LUFS target is on the roadmap:
              louder audio is reliably judged &ldquo;better,&rdquo; so equalizing
              it removes a known confound before it can skew the ranking.
            </p>
          </Section>

          <Section title="Anti-gaming">
            <p>
              A small fraction of rounds are attention checks with a known
              answer; they never count toward the ranking but flag low-effort
              voting so it can be down-weighted. A privacy-friendly bot challenge
              and a per-source rate limit (on a hashed IP, never the raw address)
              raise the cost of ballot-stuffing without collecting personal data.
            </p>
          </Section>

          <Section title="Honest caveats">
            <p>
              Preference is relative and population-dependent — it measures which
              of two voices sounds more human to these listeners, not a
              ground-truth score, and says nothing about intelligibility, cost,
              or fit for a use case. Rankings move as votes accumulate; the
              confidence intervals are the point.
            </p>
          </Section>
        </EmailGate>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/#arena"
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Play a round <Icon name="arrow-right" />
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 rounded-full border border-hair-strong bg-card px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink/25"
        >
          See the leaderboard
        </Link>
      </div>
    </div>
  );
}
