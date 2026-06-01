import Link from 'next/link'
import { ArrowLeft, FileText, Calendar, Bitcoin, Hash, ExternalLink } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'FORESIGHT-01 · Cryptographic Pre-Registration of Financial Risk Forecasts',
  description: 'Genesis Foresight Lab working paper. A methodology for cryptographically committing dated operational-risk forecasts to a public blockchain such that the publication date is unfakeable.',
}

export default function Foresight01Page() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#4a9eff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 print:hidden"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/research" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> All papers
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <FileText className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">FORESIGHT-01</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">working paper · 7 pages · CC-BY 4.0</span>
        </div>
      </header>

      <article className="relative max-w-3xl mx-auto px-6 py-12 prose-paper">

        {/* TITLE BLOCK */}
        <div className="mb-10 pb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#4a9eff] font-mono font-bold mb-3">
            GENESIS FORESIGHT LAB · WORKING PAPER 01 · 2026
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight mb-5">
            Cryptographic Pre-Registration of Financial Risk Forecasts:<br />
            <span className="text-[rgba(255,255,255,0.65)] font-bold">A Methodology</span>
          </h1>
          <div className="text-[12px] text-[rgba(255,255,255,0.6)] mb-1">
            <strong className="text-white">Daman Sharma</strong>
            <span className="mx-2">·</span>
            Genesis Swarm, Luxembourg
            <span className="mx-2">·</span>
            <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#4a9eff] hover:underline">daman.sharma.2310@gmail.com</a>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.45)] mt-4">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 30 May 2026</span>
            <span className="flex items-center gap-1"><Bitcoin className="w-3 h-3 text-[#f7931a]" /> Anchor 9e52141c…</span>
            <span>CC-BY 4.0</span>
          </div>
        </div>

        <Section h="Abstract">
          We propose a methodology for cryptographically committing operational-risk forecasts on
          named financial entities to a public timestamping authority — Bitcoin via the
          OpenTimestamps protocol — such that the publication date of the forecast is
          computationally unfakeable. We argue this transforms risk forecasting from a
          backward-looking subjective activity into a falsifiable, dated, scientific claim,
          analogous to pre-registration in clinical trials. We describe the canonical-serialisation
          and Merkle-commitment procedure, present the inaugural application of the protocol (a
          five-entity Watch List for the European financial sector, reveal window 2026-05 to
          2027-11), and discuss the consequences for the operational-risk forecasting industry.
        </Section>

        <Section h="1. Introduction">
          <P>
            The dominant practice in commercial financial risk forecasting is opaque, undated, and
            unfalsifiable. Vendors publish ratings, scores, and watchlists; the entities involved
            are usually not named in advance of an adverse event; the methodology is private; and
            the credit for past forecasts is impossible to audit because the publication date of
            those forecasts cannot be independently verified. When a collapse occurs, vendors
            invariably announce after the fact that the entity had been &ldquo;on our watch list&rdquo; — a
            claim impossible to verify and impossible to falsify.
          </P>
          <P>
            The scientific research community has solved an analogous problem through{' '}
            <em>pre-registration</em>. Clinical trials, since at least the 2007 amendment to the
            US FDA reauthorisation act, are required to register their hypothesis, methodology,
            and primary endpoints in advance — making it impossible to retrospectively adjust the
            study after the data is observed (the so-called &ldquo;HARKing&rdquo; problem of Hypothesising
            After the Results are Known). We argue that financial risk forecasting is structurally
            equivalent and that an equivalent pre-registration mechanism is both desirable and now
            practical.
          </P>
        </Section>

        <Section h="2. Why a public blockchain solves the publication-date problem">
          <P>
            The methodological challenge in risk-forecast pre-registration is verifying the
            publication date without a trusted central authority. Conventional timestamping
            requires a trusted intermediary; a vendor who cooperates with a third-party
            timestamping service can still in principle predate or revise a forecast in
            collaboration with that intermediary. The literature on post-quantum trusted
            timestamping (Haber and Stornetta, 1991; Bayer et al., 1993) demonstrates that a
            sufficiently widely-replicated, computationally expensive chain serves as an unforgeable
            timestamping authority.
          </P>
          <P>
            The Bitcoin blockchain meets this requirement empirically. The aggregate hashrate
            committed to Bitcoin (roughly 7×10²⁰ hashes per second at the time of writing) makes
            re-writing any block deeper than approximately six confirmations computationally
            infeasible under current and projected hardware. Anchoring a digest to a Bitcoin block
            via the OpenTimestamps protocol (Todd, 2016) — which aggregates many digests into a
            single transaction via a Merkle tree, then commits the root via OP_RETURN — provides
            a globally verifiable, intermediary-free attestation of publication date with
            essentially zero marginal cost per attestation.
          </P>
        </Section>

        <Section h="3. The Genesis pre-registration protocol">
          <P>
            We define a forecast as a tuple <em>F = (publication_ts, reveal_ts, entities, criteria)</em>{' '}
            where <em>entities</em> is an ordered list of named legal entities (with optional LEIs),{' '}
            <em>criteria</em> is the set of operationalised vindication criteria per entity (e.g.
            an enforcement action exceeding a stated threshold, a leadership departure, a share-price
            decline of a stated magnitude over the reveal window), <em>publication_ts</em> is the
            ISO-8601 publication timestamp, and <em>reveal_ts</em> is the ISO-8601 timestamp at
            which the forecast becomes resolvable.
          </P>
          <P>
            The protocol then computes <em>H = SHA-256(canonical(F))</em> where{' '}
            <em>canonical</em> denotes a deterministic serialisation specified in the appendix.
            The digest <em>H</em> is submitted to a public OpenTimestamps calendar, which returns
            an attestation. The attestation is published alongside the forecast. Verification by
            an independent party requires only the public forecast and the calendar URL: anyone
            can recompute <em>H</em>, query the calendar, and verify that the digest was
            committed to the Bitcoin chain at the stated publication date.
          </P>
        </Section>

        <Section h="4. Application: The Genesis Watch List 2026-2027">
          <P>
            We applied the protocol to the inaugural Genesis Watch List on 30 May 2026. The list
            comprises five named European financial entities (UBS Europe SE, Deutsche Bank AG
            London Branch, KBC Asset Management N.V., Banque Internationale à Luxembourg, and
            Société Générale Luxembourg), each with documented public-record signals and five
            falsifiable vindication criteria spanning supervisory enforcement, audit qualification,
            leadership disclosure, and share-price stress.
          </P>
          <P>
            The canonical SHA-256 digest of the list is{' '}
            <code className="text-[#f7931a] font-mono break-all">9e52141ce22948f8ea7d6bd354a73b2f0fba2d3e25d1596360a03096a9a059d1</code>.
            The OpenTimestamps calendar attestation was returned at 2026-05-30 11:57:42 UTC. The
            reveal date is 2027-11-30. At the reveal date, the protocol requires that each entity
            be evaluated against its stated vindication criteria using only public-record sources;
            unconfirmed entries are publicly retired.
          </P>
        </Section>

        <Section h="5. Consequences for the risk-forecasting industry">
          <P>
            The cryptographic pre-registration protocol has three immediate consequences. First,
            it makes the credit-claim activity of risk vendors auditable: a vendor that claims to
            have warned about an entity must produce a pre-registered forecast or accept the
            absence of credit. Second, it makes the methodology comparable across vendors: two
            vendors who publish pre-registered forecasts on overlapping entities and time-windows
            generate, over time, a head-to-head record. Third, it shifts the incentive structure
            in favour of falsifiable, narrow, named forecasts over vague, broad, hedged
            commentary.
          </P>
          <P>
            We expect resistance from incumbents whose business model depends on the absence of
            this auditability. We expect adoption by independent and open analytical projects whose
            credibility is asset-defining. We expect that the Genesis Watch List, regardless of
            its individual vindication rate, will be cited as the first instance of a falsifiable
            forecast in the public risk-modelling literature.
          </P>
        </Section>

        <Section h="6. Limitations">
          <P>
            The protocol guarantees only the publication date of a forecast — not its accuracy.
            A forecast can be perfectly committed and entirely wrong. Falsifiability is a
            necessary but not sufficient condition for credibility; the credibility of a vendor
            applying this protocol over time is determined by its observed vindication rate
            against its published criteria. We treat this not as a weakness but as the central
            feature: the protocol forces vendors to live by their record.
          </P>
        </Section>

        <Section h="References">
          <ul className="text-[12px] text-[rgba(255,255,255,0.7)] space-y-2 list-none pl-0">
            <li>Bayer, D., Haber, S. and Stornetta, W. S. (1993). &ldquo;Improving the Efficiency and Reliability of Digital Time-Stamping.&rdquo; Sequences II: Methods in Communication, Security, and Computer Science, 329–334.</li>
            <li>Haber, S. and Stornetta, W. S. (1991). &ldquo;How to Time-Stamp a Digital Document.&rdquo; Journal of Cryptology, 3(2), 99–111.</li>
            <li>Nakamoto, S. (2008). &ldquo;Bitcoin: A Peer-to-Peer Electronic Cash System.&rdquo; Available at: bitcoin.org/bitcoin.pdf</li>
            <li>Todd, P. (2016). &ldquo;OpenTimestamps: Scalable, Trust-Minimised, Distributed Timestamping with Bitcoin.&rdquo; Available at: petertodd.org/2016/opentimestamps-announcement</li>
            <li>U.S. Food and Drug Administration. (2007). FDA Amendments Act of 2007, §801. Mandatory clinical trial registration.</li>
          </ul>
        </Section>

        {/* CITE */}
        <section className="mt-12 rounded-xl p-5"
          style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.25)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-[#4a9eff]" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#4a9eff]">Cite as</span>
          </div>
          <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] bg-black/40 rounded p-3 overflow-x-auto">
{`Sharma, D. (2026). "Cryptographic Pre-Registration of Financial Risk
Forecasts: A Methodology." Genesis Foresight Lab Working Paper FORESIGHT-01.
Genesis Swarm, Luxembourg. 30 May 2026.
Bitcoin anchor: 9e52141ce22948f8ea7d6bd354a73b2f0fba2d3e25d1596360a03096a9a059d1`}
          </pre>
          <a href="https://btc.calendar.opentimestamps.org/timestamp/9e52141ce22948f8ea7d6bd354a73b2f0fba2d3e25d1596360a03096a9a059d1"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-[11px] text-[#f7931a] hover:underline">
            Verify the Bitcoin anchor → <ExternalLink className="w-3 h-3" />
          </a>
        </section>

      </article>
    </div>
  )
}

function Section({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-black text-white tracking-tight mb-4 mt-8">{h}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-[rgba(255,255,255,0.82)] leading-relaxed">{children}</p>
}
