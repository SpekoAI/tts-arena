import { cookies } from "next/headers";
import { DEFAULT_LANG, getLang } from "@/lib/types";
import VotingArena from "@/components/VotingArena";

/**
 * Deep-link to a focused voting view. The arena also lives inline on the home
 * page; this is the standalone version (English-first, defaults to English).
 */
export default async function VotePage() {
  const store = await cookies();
  const code = store.get("lang")?.value;
  const lang = code && getLang(code) ? code : DEFAULT_LANG;

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">
        Which voice sounds more human?
      </h1>
      <p className="mx-auto mt-2 max-w-md text-center text-[15px] text-ink-soft">
        Play both clips and pick the one that sounds more natural.
      </p>
      <div className="mt-8">
        <VotingArena lang={lang} />
      </div>
    </div>
  );
}
