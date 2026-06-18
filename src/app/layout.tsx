import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import SpekoMark from "@/components/SpekoMark";
import { hasRealSamples } from "@/lib/samples";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Speko's TTS Arena — which voice sounds most human?",
  description:
    "Blind A/B listening tests for text-to-speech, ranked with Bradley-Terry statistics against a real human baseline. Vote, and see which AI voices have crossed the line.",
  openGraph: {
    title: "Speko's TTS Arena — which voice sounds most human?",
    description:
      "Blind A/B listening tests for text-to-speech, ranked against a real human baseline.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fbfcfe",
  width: "device-width",
  initialScale: 1,
};

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <SpekoMark className="h-7 w-7" />
      <span className="text-[16px] font-semibold tracking-tight text-ink">
        Speko<span className="text-ink-faint">&apos;s</span> TTS Arena
      </span>
    </Link>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
    >
      {children}
    </Link>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const demo = process.env.DEMO_MODE === "1";
  const real = hasRealSamples();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-full">
        <header className="sticky top-0 z-30 border-b border-hair bg-canvas/85 supports-[backdrop-filter]:backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
            <Wordmark />
            <nav className="flex items-center gap-1 sm:gap-2">
              <NavLink href="/leaderboard">Leaderboard</NavLink>
              <Link
                href="/#arena"
                className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-ring transition-colors hover:bg-accent-hover"
              >
                Start voting
              </Link>
            </nav>
          </div>
          {(demo || real) && (
            <div className="border-t border-hair bg-canvas-deep px-4 py-1.5 text-center text-[11px] font-medium text-ink-muted">
              {real
                ? "Real Speko-synthesized voices · leaderboard scores stay illustrative until live votes accumulate"
                : "Demo — voices are placeholder clips and leaderboard numbers are illustrative, not live results"}
            </div>
          )}
        </header>

        <main className="relative">{children}</main>

        <footer className="mt-28 border-t border-hair bg-canvas-deep/50">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-12 sm:flex-row sm:px-8">
            <div className="flex items-center gap-2.5 text-sm text-ink-muted">
              <SpekoMark className="h-[22px] w-[22px]" />
              <span>
                <span className="font-semibold text-ink">Speko&apos;s TTS Arena</span>{" "}
                — measured against a real human
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-muted">
              <Link href="/leaderboard" className="hover:text-ink">
                Leaderboard
              </Link>
              <Link href="/#arena" className="hover:text-ink">
                Vote
              </Link>
              <Link href="/methodology" className="hover:text-ink">
                Report
              </Link>
              <a
                href="https://github.com/SpekoAI/tts-arena"
                target="_blank"
                rel="noreferrer"
                className="hover:text-ink"
              >
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
