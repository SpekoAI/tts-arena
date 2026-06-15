import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTS Arena",
  description:
    "Blind A/B voting on multilingual text-to-speech. Pick your language, vote which voice sounds more natural.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full bg-neutral-950 text-neutral-100">
        <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-neutral-100"
            >
              TTS Arena
            </Link>
            <Link
              href="/leaderboard"
              className="text-sm font-medium text-neutral-400 transition-colors hover:text-accent"
            >
              Leaderboard
            </Link>
          </div>
        </header>
        {process.env.DEMO_MODE === "1" && (
          <div className="border-b border-amber-900/50 bg-amber-950/40 px-4 py-1.5 text-center text-xs text-amber-300">
            DEMO MODE · clips are local macOS voices, leaderboard numbers are
            illustrative — no database or real results
          </div>
        )}
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
