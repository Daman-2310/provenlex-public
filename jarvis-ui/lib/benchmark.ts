// PROVENLEX BENCHMARK — the data-flywheel / moat layer.
//
// Every fund scanned contributes an anonymised metric sample to a local pool;
// percentiles are computed against that pool merged with a seeded reference
// distribution. The more funds scanned, the sharper the benchmark — a moat that
// compounds with use and that a competitor cannot replicate without the data.
//
// HONESTY: the seed below is a *reference distribution* modelled on published
// Luxembourg loan-fund ranges, NOT proprietary aggregated data. It exists so the
// percentile is meaningful from sample #1; it is clearly labelled as such in the
// UI, and real anonymised samples are layered on top as funds are scanned.

const POOL_KEY = 'genesis_benchmark_pool_v1'

// Reference distributions (≈ plausible Lux loan-fund spread), deterministic.
const SEED = {
  leverage: [80, 95, 110, 120, 125, 130, 140, 145, 150, 155, 160, 165, 170, 172, 175, 175, 180, 190, 120, 135, 148, 158, 168, 100, 115],
  concentration: [5, 6, 7, 8, 9, 10, 10, 11, 12, 12, 13, 14, 15, 15, 16, 18, 20, 8, 9, 11, 13, 17, 19, 22, 25],
  retention: [5, 5, 5, 6, 6, 7, 7, 8, 8, 9, 10, 5, 5, 6, 7, 8, 5, 5, 6, 5, 7, 9, 10, 5, 6],
}

export interface BenchSample { leverage?: number; concentration?: number; retention?: number }

function getPool(): BenchSample[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(POOL_KEY)
    return raw ? (JSON.parse(raw) as BenchSample[]) : []
  } catch { return [] }
}

export function recordSample(s: BenchSample) {
  if (typeof window === 'undefined') return
  if (s.leverage == null && s.concentration == null && s.retention == null) return
  try {
    const pool = getPool()
    pool.push(s)
    window.localStorage.setItem(POOL_KEY, JSON.stringify(pool.slice(-500)))
  } catch { /* quota */ }
}

// Percentile rank: share of the population at or below `value` (0–100).
function percentile(value: number, population: number[]): number {
  if (population.length === 0) return 50
  const below = population.filter(x => x <= value).length
  return Math.round((below / population.length) * 100)
}

export interface BenchmarkResult {
  sampleSize: number
  leverage: { value: number; percentile: number } | null
  concentration: { value: number; percentile: number } | null
  retention: { value: number; percentile: number } | null
}

export function benchmark(metrics: BenchSample): BenchmarkResult {
  const pool = getPool()
  const merge = (key: keyof BenchSample) =>
    [...SEED[key], ...pool.map(p => p[key]).filter((v): v is number => typeof v === 'number')]

  return {
    sampleSize: SEED.leverage.length + pool.length,
    leverage: metrics.leverage != null ? { value: metrics.leverage, percentile: percentile(metrics.leverage, merge('leverage')) } : null,
    concentration: metrics.concentration != null ? { value: metrics.concentration, percentile: percentile(metrics.concentration, merge('concentration')) } : null,
    retention: metrics.retention != null ? { value: metrics.retention, percentile: percentile(metrics.retention, merge('retention')) } : null,
  }
}
