export const runtime = 'edge'

// Real EUR FX rates via Frankfurter (ECB-sourced, free, no auth)
// https://www.frankfurter.app
export async function GET() {
  try {
    const upstream = await fetch(
      'https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,CHF,JPY,CNY,SGD,SEK,CAD,AUD,NOK',
      { next: { revalidate: 300 } }, // 5 minute cache
    )
    if (!upstream.ok) {
      return Response.json({ error: `Frankfurter upstream ${upstream.status}` }, { status: 502 })
    }
    const data = (await upstream.json()) as { amount: number; base: string; date: string; rates: Record<string, number> }
    return Response.json({
      base: data.base,
      date: data.date,
      rates: data.rates,
      source: 'ECB · via Frankfurter (frankfurter.app)',
      timestamp: new Date().toISOString(),
      pairs: Object.entries(data.rates).map(([sym, rate]) => ({
        pair: `${data.base}/${sym}`,
        rate: Number(rate),
        formatted: rate.toFixed(sym === 'JPY' ? 2 : 4),
      })),
    })
  } catch (e) {
    return Response.json({ error: 'fetch failed', detail: String(e) }, { status: 500 })
  }
}
