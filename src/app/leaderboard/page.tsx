import { cookies, headers } from "next/headers";
import Link from "next/link";
import CIBar from "@/components/CIBar";
import { getLang, LANGUAGES, type LeaderboardRow } from "@/lib/types";
import LangSwitcher from "./LangSwitcher";

/** Always fetch fresh — rankings move as votes land. */
export const dynamic = "force-dynamic";

/** Resolve the language: explicit ?lang= wins, then the cookie, then English. */
async function resolveLang(searchLang: string | undefined): Promise<string> {
  if (searchLang && getLang(searchLang)) return searchLang;
  const store = await cookies();
  const cookieLang = store.get("lang")?.value;
  if (cookieLang && getLang(cookieLang)) return cookieLang;
  return "en";
}

/** Build an absolute origin for the server-side API fetch. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchRows(lang: string): Promise<LeaderboardRow[]> {
  try {
    const base = await origin();
    const res = await fetch(
      `${base}/api/leaderboard?lang=${encodeURIComponent(lang)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    return (await res.json()) as LeaderboardRow[];
  } catch {
    return [];
  }
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: searchLang } = await searchParams;
  const lang = await resolveLang(searchLang);
  const langMeta = getLang(lang);
  const rows = await fetchRows(lang);

  // Shared score axis across every bar so the column reads as a forest plot.
  let domainMin = Infinity;
  let domainMax = -Infinity;
  for (const r of rows) {
    domainMin = Math.min(domainMin, r.btLo);
    domainMax = Math.max(domainMax, r.btHi);
  }
  if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax)) {
    domainMin = 1300;
    domainMax = 1700;
  }
  // Small pad so end ticks aren't clipped against the track edges.
  const pad = (domainMax - domainMin) * 0.05 || 20;
  domainMin -= pad;
  domainMax += pad;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Bradley-Terry ranking from blind votes · 95% bootstrap intervals
          </p>
        </div>
        <LangSwitcher current={lang} languages={LANGUAGES} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <p className="text-neutral-300">
            No rankings yet for{" "}
            {langMeta ? `${langMeta.flag} ${langMeta.nativeName}` : lang}.
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            Votes are still being collected.{" "}
            <Link href="/vote" className="text-accent hover:text-accent-hover">
              Cast some →
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">System</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                  Score
                </th>
                <th className="w-1/3 px-3 py-2.5 font-medium">95% CI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.systemId}
                  className={`border-b border-neutral-900 last:border-0 ${r.isProvisional ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-3 align-middle tabular-nums text-neutral-400">
                    {r.rank ?? i + 1}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="font-medium text-neutral-100">
                      {r.vendor} {r.modelName}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {r.voiceLabel ? `${r.voiceLabel} · ` : ""}
                      {r.voteCount.toLocaleString()} votes
                      {r.isProvisional && (
                        <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                          provisional
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 text-right align-middle tabular-nums text-neutral-100 sm:table-cell">
                    {r.btScore.toFixed(0)}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <CIBar
                      score={r.btScore}
                      lo={r.btLo}
                      hi={r.btHi}
                      domainMin={domainMin}
                      domainMax={domainMax}
                      muted={r.isProvisional}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-600">
        Provisional rows have fewer than 250 votes and aren&apos;t ranked yet.{" "}
        <Link href="/vote" className="text-accent hover:text-accent-hover">
          Keep voting →
        </Link>
      </p>
    </div>
  );
}
