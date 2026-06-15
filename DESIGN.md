# TTS Arena — Design & Methodology

A one-page account of how the arena turns anonymous taps into a ranking, and
the honest limits of what that ranking means.

## How it works

**Blind A/B preference.** A voter is shown the prompt text and two audio clips,
A and B, rendered by two *different* systems from the *same* prompt. They play
both and pick which sounds more natural — or Tie / Can't tell. Vendor and model
names are hidden until the moment after the vote lands. The clips' left/right
and A/B positions are randomized client-side, and both `leftWasA` and
`playedFirst` are recorded so position- and order-bias can be measured (and, if
needed, corrected) later. Voting is disabled until both clips have actually
played, so a vote reflects a real comparison.

**One-tap native language.** On entry the voter taps the language they speak.
There is no account and no verification — just a `lang` cookie. A pair's
language (not the voter's) decides which leaderboard the vote counts toward; the
voter's declared language is also stored on the vote, so the leaderboard can
optionally be filtered to native-only voters.

**Bradley-Terry ranking with bootstrap CIs.** Per language, all ranking-eligible
votes are fit with a Bradley-Terry maximum-likelihood model (Hunter's MM
algorithm, ties split 0.5/0.5). Scores are reported on an Elo-style scale
(1500 baseline). Each system also gets a **percentile-bootstrap 95% confidence
interval** — resample the votes with replacement, refit, and read the 2.5/97.5
percentiles. A system is shown as **provisional** until it has enough votes
(≥250); below that the rank is withheld.

**Winner only when the CIs separate.** A higher point score is not a win. We
treat two systems as distinguishable only when their confidence intervals do not
overlap. Overlapping intervals mean "too close to call given the data so far" —
the honest answer, not a forced ordering.

## Anti-gaming

Anonymity is the product, so the defenses are about *vote quality*, not
identity:

- **Gold pairs.** A small fraction (~5%) of served pairs are attention checks
  with a known expected verdict. These do not count toward ranking
  (`countsForRank = false`); they flag low-effort or adversarial voting so those
  votes can be down-weighted (`voteWeight`) without banning anyone.
- **Cloudflare Turnstile (optional).** A privacy-friendly, no-PII bot challenge.
  When configured, `turnstileOk` is recorded per vote; when not, the field is
  simply false and the arena still runs.
- **IP rate-limit.** A lightweight per-IP cap (the IP is hashed, never stored
  raw) throttles flooding from a single source. Combined with the anon-cookie
  dedup, this raises the cost of stuffing the ballot without collecting PII.

None of these are perfect; they raise the cost of gaming and give the
aggregation a weight signal to lean on.

## Audio fairness

All clips are **loudness-normalized** (to a common LUFS target) before upload.
Louder audio is reliably judged "better," so normalizing removes a confound that
would otherwise reward whoever ships the hottest master rather than the most
natural voice. The same prompt text is used across systems within a pair, so the
comparison is voice-vs-voice, not script-vs-script.

## Honest caveats

- **Self-declared native is unverified.** The `lang` tap is a single cookie, not
  proof. Treat per-language results as "voters who *said* they speak this
  language," and use native-only filtering as a lens, not a guarantee.
- **Preference is not absolute naturalness.** A/B preference measures *which of
  these two sounds more natural to these voters* — relative, population- and
  prompt-dependent, and shaped by what voters are used to hearing. It is not a
  ground-truth naturalness score, and it does not capture intelligibility,
  accuracy, latency, cost, or suitability for a specific use case.
- **Coverage and selection bias.** Languages, prompts, voters, and the chosen
  reference voice per system are all sampling choices. Sparse languages stay
  provisional for a reason; thin data produces wide intervals, and wide
  intervals mean we should not declare a winner.
- **A snapshot, not a verdict.** Rankings recompute on a schedule and will move
  as votes accumulate. The confidence intervals are the point: report the
  uncertainty, and only call a winner when the data actually separates the
  systems.
