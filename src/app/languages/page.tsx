"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LANGUAGES, type Lang } from "@/lib/types";

/**
 * Language picker. The arena is English-first, so this is a secondary entry
 * point (linked from the arena) for voters who want to judge another language.
 * One tap sets the `lang` cookie and routes into voting.
 */
export default function LanguagesPage() {
  const router = useRouter();

  function pick(lang: Lang) {
    const maxAge = 60 * 60 * 24 * 180; // 180 days
    document.cookie = `lang=${encodeURIComponent(lang.code)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    router.push("/vote");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <span className="chip">🌍 Multilingual arena</span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
          Pick a language to judge
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-neutral-400">
          Vote on voices in a language you natively speak. Your pick decides
          which leaderboard your votes count toward.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => pick(lang)}
            dir={lang.rtl ? "rtl" : "ltr"}
            className="glass flex min-h-[6rem] flex-col items-center justify-center gap-1 rounded-2xl px-4 py-5 transition-all hover:border-accent hover:bg-ink-700 active:scale-[0.98]"
          >
            <span className="text-3xl leading-none" aria-hidden>
              {lang.flag}
            </span>
            <span className="mt-1 text-base font-medium text-neutral-100">
              {lang.nativeName}
            </span>
            <span className="text-xs text-neutral-500">{lang.englishName}</span>
          </button>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-neutral-600">
        Anonymous. No login, no account.{" "}
        <Link href="/vote" className="text-accent-hover hover:text-accent">
          Or jump straight into English →
        </Link>
      </p>
    </div>
  );
}
