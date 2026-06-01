// supabase/functions/regulator-scraper/index.ts  — Protocol 4 (Deno runtime)
//
// Long-running ingestion loop, OFF Vercel's serverless boundary. Runs on
// Supabase infrastructure; scheduled by pg_cron (see deploy steps below).
// The service-role key never leaves Supabase infra.
//
// Deploy:
//   supabase functions new regulator-scraper   # (already scaffolded by this file)
//   supabase secrets set SUPABASE_URL=https://<ref>.supabase.co
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
//   supabase functions deploy regulator-scraper --no-verify-jwt

import { createClient } from "jsr:@supabase/supabase-js@2"

interface Feed { source: string; url: string }

const FEEDS: Feed[] = [
  { source: "CSSF",  url: "https://www.cssf.lu/en/category/news/feed/" },
  { source: "BaFin", url: "https://www.bafin.de/SiteGlobals/Functions/RSSFeed/EN/RSSNewsroom/RSSNewsroom.xml" },
  { source: "ESMA",  url: "https://www.esma.europa.eu/news-and-publications/press-releases/rss.xml" },
  { source: "EBA",   url: "https://www.eba.europa.eu/news-publications/news/_/jcr_content/rss.xml" },
  { source: "FCA",   url: "https://www.fca.org.uk/news/rss.xml" },
]

function pick(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))
  if (!m) return ""
  const cdata = m[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  return (cdata ? cdata[1] : m[1]).trim()
}
function items(xml: string): string[] {
  const out: string[] = []
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}
async function sha1(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("")
}
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )
  let ingested = 0
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "Genesis-Swarm/1.0" },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const rows = []
      for (const it of items(xml).slice(0, 12)) {
        const title = strip(pick(it, "title"))
        if (!title) continue
        const link = pick(it, "link")
        rows.push({
          id: await sha1(`${feed.source}:${link || title}`),
          source: feed.source,
          title,
          link,
          summary: strip(pick(it, "description")).slice(0, 280),
          published: new Date(pick(it, "pubDate") || Date.now()).toISOString(),
        })
      }
      if (rows.length) {
        // requires a regulator_items table; upsert idempotently on id
        await sb.from("regulator_items").upsert(rows, { onConflict: "id" })
        ingested += rows.length
      }
    } catch (e) {
      console.error(`feed ${feed.source} failed:`, e)
    }
  }
  return new Response(JSON.stringify({ ok: true, ingested }), {
    headers: { "Content-Type": "application/json" },
  })
})
