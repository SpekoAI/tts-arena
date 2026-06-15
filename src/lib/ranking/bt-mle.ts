/**
 * Bradley-Terry MLE with tie support (Davidson-style: ties count as 0.5/0.5)
 * via Hunter's MM algorithm (Hunter 2004), plus percentile-bootstrap
 * 95% confidence intervals.
 *
 * Outputs are converted to Elo-style "BT scores":
 *   bt_score = 1500 + 400 / ln(10) * theta
 * with theta centered so the population mean is 1500.
 *
 * Pure functions, no I/O. Caller is responsible for fetching votes and
 * writing rankings.
 *
 * Ported verbatim from speko-arena; the only change is the Verdict type,
 * which here is the arena's ("a" | "b" | "tie") with no "tie_bad".
 */

export type Verdict = "a" | "b" | "tie";

export interface VoteRow {
  /** system on side A of the pair */
  voiceA: string;
  /** system on side B of the pair */
  voiceB: string;
  verdict: Verdict;
  /** vote_weight column — usually 1.0; banned/yellow raters can be 0 or 0.5 */
  weight: number;
}

export interface BTScore {
  voiceId: string;
  /** centered log-odds, mean across systems = 0 */
  theta: number;
  /** Elo-scaled (1500 baseline, 400 per log-10) */
  btScore: number;
  /** 95% percentile-bootstrap interval (Elo scale) */
  btLo: number;
  btHi: number;
  /** how many votes contributed this system */
  voteCount: number;
}

const SCALE = 400 / Math.log(10); // ≈ 173.7
const BASELINE = 1500;

/** One Hunter-MM update of theta, given pairwise win-counts. */
function mmIterate(
  voiceIds: string[],
  W: Map<string, number>, // wins (with 0.5 per tie)
  N: Map<string, Map<string, number>>, // pairwise total comparisons
  theta: Map<string, number>,
): Map<string, number> {
  const next = new Map<string, number>();
  const eTheta = new Map<string, number>();
  for (const v of voiceIds) eTheta.set(v, Math.exp(theta.get(v) ?? 0));

  for (const i of voiceIds) {
    const wi = W.get(i) ?? 0;
    if (wi <= 0) {
      // No wins → push toward -inf, but clamp so iteration stays finite
      next.set(i, -10);
      continue;
    }
    let denom = 0;
    const Ni = N.get(i);
    if (!Ni) {
      next.set(i, theta.get(i) ?? 0);
      continue;
    }
    for (const [j, nij] of Ni) {
      if (i === j) continue;
      denom += nij / ((eTheta.get(i) ?? 1) + (eTheta.get(j) ?? 1));
    }
    if (denom <= 0) {
      next.set(i, theta.get(i) ?? 0);
      continue;
    }
    next.set(i, Math.log(wi) - Math.log(denom));
  }

  // Center to mean 0 to keep numbers stable + make the absolute scale meaningful
  let sum = 0;
  for (const v of voiceIds) sum += next.get(v) ?? 0;
  const mean = sum / voiceIds.length;
  for (const v of voiceIds) next.set(v, (next.get(v) ?? 0) - mean);

  return next;
}

/** Run Hunter MM until converged (max abs change < tol) or maxIter hit. */
function fitTheta(
  votes: VoteRow[],
  voiceIds: string[],
  maxIter = 500,
  tol = 1e-6,
): Map<string, number> {
  // Aggregate wins and total comparisons per pair
  const W = new Map<string, number>();
  const N = new Map<string, Map<string, number>>();
  for (const v of voiceIds) {
    W.set(v, 0);
    N.set(v, new Map());
  }

  for (const v of votes) {
    if (v.weight <= 0) continue;
    const a = v.voiceA;
    const b = v.voiceB;
    if (!W.has(a) || !W.has(b)) continue;

    const Na = N.get(a)!;
    const Nb = N.get(b)!;
    Na.set(b, (Na.get(b) ?? 0) + v.weight);
    Nb.set(a, (Nb.get(a) ?? 0) + v.weight);

    if (v.verdict === "a") {
      W.set(a, (W.get(a) ?? 0) + v.weight);
    } else if (v.verdict === "b") {
      W.set(b, (W.get(b) ?? 0) + v.weight);
    } else {
      // tie — split the win
      W.set(a, (W.get(a) ?? 0) + 0.5 * v.weight);
      W.set(b, (W.get(b) ?? 0) + 0.5 * v.weight);
    }
  }

  // Initialize theta uniformly
  let theta = new Map<string, number>(voiceIds.map((v) => [v, 0]));

  for (let iter = 0; iter < maxIter; iter++) {
    const next = mmIterate(voiceIds, W, N, theta);
    let maxDelta = 0;
    for (const v of voiceIds) {
      const d = Math.abs((next.get(v) ?? 0) - (theta.get(v) ?? 0));
      if (d > maxDelta) maxDelta = d;
    }
    theta = next;
    if (maxDelta < tol) break;
  }

  return theta;
}

/** Vote count per system (across both sides) for the rankings.vote_count field. */
function voteCounts(votes: VoteRow[], voiceIds: string[]): Map<string, number> {
  const counts = new Map<string, number>(voiceIds.map((v) => [v, 0]));
  for (const v of votes) {
    if (v.weight <= 0) continue;
    if (counts.has(v.voiceA)) counts.set(v.voiceA, counts.get(v.voiceA)! + 1);
    if (counts.has(v.voiceB)) counts.set(v.voiceB, counts.get(v.voiceB)! + 1);
  }
  return counts;
}

/**
 * Fit BT-MLE with percentile-bootstrap 95% CIs.
 * For B bootstraps, resample votes with replacement, refit, collect
 * Elo-scaled scores per system, take 2.5%/97.5% percentiles.
 */
export function fitBT(
  votes: VoteRow[],
  voiceIds: string[],
  bootstraps = 100,
): BTScore[] {
  if (voiceIds.length === 0) return [];
  if (votes.length === 0) {
    // Nothing to fit — return zeros. Caller decides what to do (likely skip).
    return voiceIds.map((id) => ({
      voiceId: id,
      theta: 0,
      btScore: BASELINE,
      btLo: BASELINE,
      btHi: BASELINE,
      voteCount: 0,
    }));
  }

  const point = fitTheta(votes, voiceIds);
  const counts = voteCounts(votes, voiceIds);

  // Bootstrap
  const samples: Map<string, number[]> = new Map(voiceIds.map((id) => [id, []]));
  for (let b = 0; b < bootstraps; b++) {
    const resampled: VoteRow[] = new Array(votes.length);
    for (let i = 0; i < votes.length; i++) {
      resampled[i] = votes[(Math.random() * votes.length) | 0];
    }
    const theta = fitTheta(resampled, voiceIds, 200, 1e-4);
    for (const v of voiceIds) {
      const elo = BASELINE + SCALE * (theta.get(v) ?? 0);
      samples.get(v)!.push(elo);
    }
  }

  const out: BTScore[] = [];
  for (const v of voiceIds) {
    const theta = point.get(v) ?? 0;
    const elo = BASELINE + SCALE * theta;
    const arr = samples.get(v)!;
    arr.sort((a, b) => a - b);
    const lo = arr[Math.floor(arr.length * 0.025)] ?? elo;
    const hi = arr[Math.floor(arr.length * 0.975)] ?? elo;
    out.push({
      voiceId: v,
      theta,
      btScore: elo,
      btLo: lo,
      btHi: hi,
      voteCount: counts.get(v) ?? 0,
    });
  }
  return out;
}
