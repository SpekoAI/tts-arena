"use client";

import { useRouter } from "next/navigation";
import { LANGUAGES, type Lang } from "@/lib/types";

/**
 * Language picker — the anonymous entry point. One tap sets the `lang` cookie
 * (the voter's declared native language) and routes to the arena. No account,
 * no auth: identity is purely the cookie set on first vote server-side.
 */
export default function HomePage() {
  const router = useRouter();

  function pick(lang: Lang) {
    // 180-day cookie; SameSite=Lax is fine for a same-origin nav. Not HttpOnly
    // on purpose — this is a non-sensitive UI preference the client owns.
    const maxAge = 60 * 60 * 24 * 180;
    document.cookie = `lang=${encodeURIComponent(lang.code)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    router.push("/vote");
  }

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
        Which voice sounds more&nbsp;human?
      </h1>
      <p className="mt-3 max-w-md text-balance text-neutral-400">
        Pick the language you natively speak. You&apos;ll hear two anonymous
        text-to-speech clips and vote which one sounds more natural.
      </p>

      <div className="mt-10 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => pick(lang)}
            dir={lang.rtl ? "rtl" : "ltr"}
            className="flex min-h-[6rem] flex-col items-center justify-center gap-1 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-5 transition-colors hover:border-accent hover:bg-neutral-800 active:scale-[0.98]"
          >
            <span className="text-4xl leading-none" aria-hidden>
              {lang.flag}
            </span>
            <span className="mt-1 text-base font-medium text-neutral-100">
              {lang.nativeName}
            </span>
            <span className="text-xs text-neutral-500">{lang.englishName}</span>
          </button>
        ))}
      </div>

      <p className="mt-10 text-xs text-neutral-600">
        Anonymous. No login, no account, no tracking beyond a vote-dedup cookie.
      </p>
    </div>
  );
}
