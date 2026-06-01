import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Real LEI lookup via GLEIF public API (Global Legal Entity Identifier Foundation)
// https://api.gleif.org/api/v1/lei-records/{LEI}
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const lei = (url.searchParams.get('lei') ?? '').trim().toUpperCase()
  const fuzzy = (url.searchParams.get('q') ?? '').trim()

  // LEI is exactly 20 alphanumeric chars
  if (lei && /^[A-Z0-9]{20}$/.test(lei)) {
    try {
      const upstream = await fetch(
        `https://api.gleif.org/api/v1/lei-records/${lei}`,
        { headers: { Accept: 'application/vnd.api+json' }, next: { revalidate: 86400 } },
      )
      if (upstream.status === 404) {
        return Response.json({ error: 'LEI not found in GLEIF registry' }, { status: 404 })
      }
      if (!upstream.ok) {
        return Response.json({ error: `GLEIF upstream ${upstream.status}` }, { status: 502 })
      }
      type Address = { country?: string; city?: string; region?: string; addressLines?: string[]; postalCode?: string }
      type GleifAttributes = {
        entity?: {
          legalName?: { name?: string }
          jurisdiction?: string
          status?: string
          legalForm?: { id?: string }
          category?: string
          headquartersAddress?: Address
          legalAddress?: Address
          registeredAt?: { id?: string }
        }
        registration?: {
          initialRegistrationDate?: string
          lastUpdateDate?: string
          status?: string
          managingLou?: string
          nextRenewalDate?: string
        }
      }
      const json = (await upstream.json()) as { data?: { attributes?: GleifAttributes } }
      const a = json.data?.attributes
      if (!a) return Response.json({ error: 'no record' }, { status: 404 })
      return Response.json({
        lei,
        legalName: a.entity?.legalName?.name,
        jurisdiction: a.entity?.jurisdiction,
        status: a.entity?.status,
        legalForm: a.entity?.legalForm?.id,
        category: a.entity?.category,
        headquarters: {
          country: a.entity?.headquartersAddress?.country,
          city: a.entity?.headquartersAddress?.city,
          region: a.entity?.headquartersAddress?.region,
          postalCode: a.entity?.headquartersAddress?.postalCode,
          addressLines: a.entity?.headquartersAddress?.addressLines,
        },
        legalAddress: {
          country: a.entity?.legalAddress?.country,
          city: a.entity?.legalAddress?.city,
          region: a.entity?.legalAddress?.region,
        },
        registration: {
          initialRegistrationDate: a.registration?.initialRegistrationDate,
          lastUpdateDate: a.registration?.lastUpdateDate,
          nextRenewalDate: a.registration?.nextRenewalDate,
          status: a.registration?.status,
          managingLou: a.registration?.managingLou,
        },
        registeredAt: a.entity?.registeredAt?.id,
        source: 'GLEIF · gleif.org',
        timestamp: new Date().toISOString(),
      })
    } catch (e) {
      return Response.json({ error: 'fetch failed', detail: String(e) }, { status: 500 })
    }
  }

  if (fuzzy) {
    // Fuzzy lookup by entity name
    try {
      const upstream = await fetch(
        `https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent(fuzzy)}`,
        { headers: { Accept: 'application/vnd.api+json' }, next: { revalidate: 3600 } },
      )
      if (!upstream.ok) {
        return Response.json({ error: `GLEIF fuzzy ${upstream.status}` }, { status: 502 })
      }
      type FuzzyHit = { relationships?: { 'lei-records'?: { data?: { id?: string } } }; attributes?: { value?: string; highlightedValue?: string } }
      const json = (await upstream.json()) as { data?: FuzzyHit[] }
      const matches = (json.data ?? []).slice(0, 8).map((m) => ({
        lei: m.relationships?.['lei-records']?.data?.id,
        name: m.attributes?.value,
        highlighted: m.attributes?.highlightedValue,
      }))
      return Response.json({ query: fuzzy, matches, source: 'GLEIF fuzzy match' })
    } catch (e) {
      return Response.json({ error: 'fuzzy fetch failed', detail: String(e) }, { status: 500 })
    }
  }

  return Response.json(
    { error: 'pass ?lei=<20-char LEI> for exact lookup or ?q=<name> for fuzzy match' },
    { status: 400 },
  )
}
