import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLang } from "@/lib/types";
import ArenaClient from "./ArenaClient";

/**
 * Server wrapper for the arena. Reads the `lang` cookie set by the picker; if
 * it's missing or unknown, bounce to the picker. Otherwise hand the validated
 * language code to the client island that drives the voting loop.
 */
export default async function VotePage() {
  const store = await cookies();
  const code = store.get("lang")?.value;

  if (!code || !getLang(code)) {
    redirect("/");
  }

  return <ArenaClient lang={code} />;
}
