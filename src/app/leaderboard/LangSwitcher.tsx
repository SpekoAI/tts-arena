"use client";

import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/types";

/**
 * Language selector for the leaderboard. Persists the choice to the `lang`
 * cookie (so the arena and a bare /leaderboard visit agree) and navigates to
 * the explicit ?lang= URL so the server component re-renders the right board.
 */
export default function LangSwitcher({
  current,
  languages,
}: {
  current: string;
  languages: Lang[];
}) {
  const router = useRouter();

  function onChange(code: string) {
    const maxAge = 60 * 60 * 24 * 180;
    document.cookie = `lang=${encodeURIComponent(code)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    router.push(`/leaderboard?lang=${encodeURIComponent(code)}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-400">
      <span className="sr-only">Language</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[2.5rem] rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-neutral-100 outline-none transition-colors hover:border-neutral-700 focus:border-accent"
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
