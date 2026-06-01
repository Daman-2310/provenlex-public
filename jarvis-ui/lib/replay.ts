// Historical fraud-collapse timelines for the Replay engine.
// Each case has a month-by-month signal-emergence record — what the
// 11 Genesis bots WOULD have detected if running at that time.

export interface ReplayMonth {
  month: string           // YYYY-MM
  label: string           // human label e.g. "Jan 2020"
  pre_crime_index: number // computed Index for that month
  signals: ReplaySignal[]
  headline: string        // one-line description of that month's events
  press?: string          // optional press coverage / public event
}

export interface ReplaySignal {
  bot: string             // bot that fires
  severity: number        // 0-100
  note: string            // what the bot saw
  fired_first?: boolean   // first month this signal appears
}

export interface ReplayCase {
  slug: string
  entity: string
  collapse_date: string
  collapse_summary: string
  aum_at_peak: string
  final_loss: string
  pattern: 'wirecard' | 'archegos' | 'ftx' | 'greensill' | 'madoff'
  hero_color: string
  timeline: ReplayMonth[]
}

const WIRECARD: ReplayCase = {
  slug: 'wirecard',
  entity: 'Wirecard AG',
  collapse_date: '2020-06-25',
  collapse_summary: '€1.9B of "trust account" cash declared non-existent. CEO Markus Braun arrested; COO Jan Marsalek fled.',
  aum_at_peak: '€24.6B market cap (Sep 2018)',
  final_loss: '€21B+ shareholder loss · 5,800 jobs',
  pattern: 'wirecard',
  hero_color: '#ff3366',
  timeline: [
    {
      month: '2019-01',
      label: 'Jan 2019',
      pre_crime_index: 22,
      headline: 'Wirecard DAX-30 inclusion at peak market cap.',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 18, note: 'Cash conversion ratio drifts below sector median', fired_first: true },
      ],
    },
    {
      month: '2019-02',
      label: 'Feb 2019',
      pre_crime_index: 41,
      headline: 'FT publishes first "House of Wirecard" investigation alleging Singapore accounting irregularities.',
      press: 'Financial Times — Dan McCrum',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 35, note: 'Cash conversion remains weak post-FT exposé' },
        { bot: 'INTELLIGENCE_BOT', severity: 70, note: 'Major financial press flags irregularities', fired_first: true },
        { bot: 'SHADOW_BOT', severity: 45, note: 'Subsidiary opacity — Asia/Pacific units unaudited externally', fired_first: true },
      ],
    },
    {
      month: '2019-04',
      label: 'Apr 2019',
      pre_crime_index: 48,
      headline: 'BaFin temporarily bans short-selling of Wirecard stock — protects management, blocks scrutiny.',
      press: 'BaFin short-sale ban',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 42, note: 'Cash position still unverified by external auditor' },
        { bot: 'INTELLIGENCE_BOT', severity: 75, note: 'Regulator action protecting subject — unusual signal', fired_first: false },
        { bot: 'COMPLIANCE_BOT', severity: 55, note: 'Internal controls divergent from sector peers', fired_first: true },
      ],
    },
    {
      month: '2019-10',
      label: 'Oct 2019',
      pre_crime_index: 58,
      headline: 'FT publishes ledger documents allegedly proving sham revenues. Stock falls 25%.',
      press: 'FT ledger leak',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 60, note: 'Sham revenue indicators in leaked ledgers' },
        { bot: 'INTELLIGENCE_BOT', severity: 88, note: 'Public document leak indicates revenue fabrication' },
        { bot: 'PBFT_QUORUM', severity: 50, note: 'No consensus on cash-position attestations', fired_first: true },
        { bot: 'YACHT_GUARDIAN', severity: 40, note: 'UBO chain through opaque Asia/Pacific entities', fired_first: true },
      ],
    },
    {
      month: '2020-01',
      label: 'Jan 2020',
      pre_crime_index: 65,
      headline: 'KPMG commissioned for special audit. Management resists data access.',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 65, note: 'Cash claims remain unsubstantiated' },
        { bot: 'INTELLIGENCE_BOT', severity: 80, note: 'Special-audit announcement — material risk indicator' },
        { bot: 'COMPLIANCE_BOT', severity: 72, note: 'Auditor data-access disputes — high-severity signal' },
        { bot: 'SHADOW_BOT', severity: 68, note: 'Reluctance to open subsidiary books to KPMG' },
      ],
    },
    {
      month: '2020-04',
      label: 'Apr 2020',
      pre_crime_index: 73,
      headline: 'KPMG special audit report: cannot confirm €1B+ of revenue. Stock down 30%.',
      press: 'KPMG report — Apr 28',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 85, note: 'KPMG confirms cash unverifiable — pattern match: wirecard' },
        { bot: 'INTELLIGENCE_BOT', severity: 90, note: 'Special-audit failure publicly disclosed' },
        { bot: 'COMPLIANCE_BOT', severity: 82, note: 'External-audit failure on €1B+ revenue' },
        { bot: 'PBFT_QUORUM', severity: 78, note: 'Quorum confidence in financial statements collapses' },
        { bot: 'MERKLE_ANCHOR', severity: 60, note: 'No cryptographic attestation of cash holdings', fired_first: true },
      ],
    },
    {
      month: '2020-06',
      label: 'Jun 2020',
      pre_crime_index: 95,
      headline: 'Wirecard declares €1.9B of cash "does not exist". CEO Braun arrested. Insolvency filed Jun 25.',
      press: 'Wirecard insolvency filed',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 100, note: 'Phantom-cash confirmed — full Wirecard pattern lock' },
        { bot: 'INTELLIGENCE_BOT', severity: 100, note: 'Insolvency filing public' },
        { bot: 'COMPLIANCE_BOT', severity: 100, note: 'Total compliance failure' },
        { bot: 'PBFT_QUORUM', severity: 100, note: 'No consensus on any material statement' },
        { bot: 'YACHT_GUARDIAN', severity: 100, note: 'COO Marsalek flees — UBO chain broken' },
        { bot: 'SHADOW_BOT', severity: 100, note: 'All Asia/Pacific subsidiaries confirmed sham' },
      ],
    },
  ],
}

const ARCHEGOS: ReplayCase = {
  slug: 'archegos',
  entity: 'Archegos Capital Management',
  collapse_date: '2021-03-26',
  collapse_summary: 'Family-office leveraged ~5x via total-return swaps with 8 prime brokers. Margin calls cascade, ~$20B unwind in 48 hours.',
  aum_at_peak: '~$10B family-office capital · ~$50B+ gross exposure',
  final_loss: '$10B+ losses across Credit Suisse, Nomura, Morgan Stanley, UBS',
  pattern: 'archegos',
  hero_color: '#ff7700',
  timeline: [
    {
      month: '2020-09',
      label: 'Sep 2020',
      pre_crime_index: 28,
      headline: 'Archegos builds positions via total-return swaps. No 13F disclosure required (family office).',
      signals: [
        { bot: 'SHADOW_BOT', severity: 45, note: 'No 13F filings; concentration cannot be observed publicly', fired_first: true },
      ],
    },
    {
      month: '2020-12',
      label: 'Dec 2020',
      pre_crime_index: 42,
      headline: 'ViacomCBS, Discovery, others rise sharply. Archegos exposure quietly grows past $30B notional.',
      signals: [
        { bot: 'SHADOW_BOT', severity: 60, note: 'Concentration in a handful of names exceeding 30% float in some cases' },
        { bot: 'FX_BOT', severity: 35, note: 'Unusual swap-position migration across multiple primes', fired_first: true },
        { bot: 'COMPLIANCE_BOT', severity: 50, note: 'Multi-broker swap concealment — structural opacity', fired_first: true },
      ],
    },
    {
      month: '2021-02',
      label: 'Feb 2021',
      pre_crime_index: 58,
      headline: 'Gross exposure crosses $50B. Hwang/Archegos hidden across 8 broker relationships.',
      signals: [
        { bot: 'SHADOW_BOT', severity: 75, note: 'Concentration pattern match: archegos — leverage exceeds 5x' },
        { bot: 'COMPLIANCE_BOT', severity: 70, note: 'Cross-broker risk aggregation gap — Basel III deficient' },
        { bot: 'PBFT_QUORUM', severity: 60, note: 'No prime broker has full view of aggregate exposure', fired_first: true },
        { bot: 'INTELLIGENCE_BOT', severity: 55, note: 'Persistent rumours of "stealth whale" in media-stock complex', fired_first: true },
      ],
    },
    {
      month: '2021-03',
      label: 'Mar 2021',
      pre_crime_index: 90,
      headline: 'ViacomCBS issues secondary; positions break. Margin calls cascade Mar 23-26. $20B unwind.',
      press: 'Archegos blowup',
      signals: [
        { bot: 'SHADOW_BOT', severity: 100, note: 'Full archegos pattern: concentration + leverage + opacity' },
        { bot: 'COMPLIANCE_BOT', severity: 100, note: 'Margin call cascade across 8 primes' },
        { bot: 'PBFT_QUORUM', severity: 100, note: 'No consensus on counterparty health' },
        { bot: 'INTELLIGENCE_BOT', severity: 100, note: 'Public blowup confirmed' },
      ],
    },
  ],
}

const FTX: ReplayCase = {
  slug: 'ftx',
  entity: 'FTX Trading Ltd',
  collapse_date: '2022-11-11',
  collapse_summary: 'Customer deposits commingled with Alameda Research trading. ~$8B shortfall. Bankman-Fried arrested.',
  aum_at_peak: '$32B valuation (Jan 2022)',
  final_loss: '~$8B customer funds lost; 1M+ creditors',
  pattern: 'ftx',
  hero_color: '#9b6dff',
  timeline: [
    {
      month: '2022-06',
      label: 'Jun 2022',
      pre_crime_index: 30,
      headline: 'FTX bails out troubled crypto lenders (BlockFi, Voyager). Praised as "JPMorgan of crypto".',
      signals: [
        { bot: 'COMPLIANCE_BOT', severity: 35, note: 'Centralized exchange operating without custody segregation rules', fired_first: true },
      ],
    },
    {
      month: '2022-09',
      label: 'Sep 2022',
      pre_crime_index: 45,
      headline: 'Alameda Research balance sheet leaks suggest FTT-token concentration.',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 60, note: 'Alameda balance sheet shows ~40% FTT (a self-issued token)', fired_first: true },
        { bot: 'COMPLIANCE_BOT', severity: 55, note: 'Related-party concentration: Alameda holds FTX-issued FTT' },
        { bot: 'YACHT_GUARDIAN', severity: 50, note: 'Bahamas domicile + Alameda US registration — UBO opacity', fired_first: true },
      ],
    },
    {
      month: '2022-11',
      label: 'Nov 2022',
      pre_crime_index: 96,
      headline: 'Binance announces FTT liquidation. Bank run Nov 6-8. FTX bankrupt Nov 11.',
      press: 'CZ tweets · FTX collapse',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 100, note: 'Phantom backing of FTT — pattern match: ftx (commingling)' },
        { bot: 'COMPLIANCE_BOT', severity: 100, note: 'Customer-fund commingling confirmed' },
        { bot: 'YACHT_GUARDIAN', severity: 100, note: 'SBF and senior staff face criminal charges' },
        { bot: 'INTELLIGENCE_BOT', severity: 100, note: 'Bankruptcy filed' },
        { bot: 'PBFT_QUORUM', severity: 100, note: 'No quorum on solvency claims' },
        { bot: 'SHADOW_BOT', severity: 100, note: 'Alameda exposure exceeded reported levels by 10x' },
      ],
    },
  ],
}

const GREENSILL: ReplayCase = {
  slug: 'greensill',
  entity: 'Greensill Capital',
  collapse_date: '2021-03-08',
  collapse_summary: 'Supply-chain finance lender collapses. Credit insurer withdraws cover; fund redemptions frozen.',
  aum_at_peak: '$143B financed obligations (2020)',
  final_loss: '$10B+ losses · Credit Suisse $3B Supply Chain Funds frozen',
  pattern: 'greensill',
  hero_color: '#ffaa00',
  timeline: [
    {
      month: '2020-06',
      label: 'Jun 2020',
      pre_crime_index: 35,
      headline: 'Greensill rapidly grows supply-chain receivable book. SoftBank Vision Fund invests $1.5B.',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 40, note: 'Single-obligor concentration (Gupta/GFG Alliance) crosses 50%', fired_first: true },
        { bot: 'SHADOW_BOT', severity: 50, note: 'Off-balance-sheet financing of related Vision Fund portfolio companies', fired_first: true },
      ],
    },
    {
      month: '2020-12',
      label: 'Dec 2020',
      pre_crime_index: 55,
      headline: 'Greensill credit insurer (BCC/Tokio Marine) signals it will not renew cover.',
      signals: [
        { bot: 'COMPLIANCE_BOT', severity: 70, note: 'Credit-insurance withdrawal pending — material risk' },
        { bot: 'NAV_DETECTOR', severity: 65, note: 'Receivable book valuation depends entirely on insurance' },
        { bot: 'INTELLIGENCE_BOT', severity: 60, note: 'Press reports on insurance withdrawal', fired_first: true },
      ],
    },
    {
      month: '2021-03',
      label: 'Mar 2021',
      pre_crime_index: 92,
      headline: 'Credit Suisse freezes Supply Chain Funds. Greensill files insolvency Mar 8.',
      press: 'Greensill insolvency',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 100, note: 'Receivable-book value collapse — pattern match: greensill' },
        { bot: 'COMPLIANCE_BOT', severity: 100, note: 'Supply-chain finance opacity confirmed' },
        { bot: 'INTELLIGENCE_BOT', severity: 100, note: 'Public insolvency filing' },
        { bot: 'YACHT_GUARDIAN', severity: 90, note: 'Lex Greensill / Cameron lobbying scandal' },
      ],
    },
  ],
}

const MADOFF: ReplayCase = {
  slug: 'madoff',
  entity: 'Bernard L. Madoff Investment Securities',
  collapse_date: '2008-12-11',
  collapse_summary: 'Largest Ponzi scheme in history. ~$65B reported AUM, ~$17.5B actual losses to investors.',
  aum_at_peak: '$65B (reported)',
  final_loss: '$17.5B actual losses · ~37,000 investor claims',
  pattern: 'madoff',
  hero_color: '#ff3366',
  timeline: [
    {
      month: '1999-05',
      label: 'May 1999',
      pre_crime_index: 50,
      headline: 'Harry Markopolos submits first SEC complaint alleging Madoff returns mathematically impossible.',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 80, note: 'Return-smoothing pattern: <1% monthly std-dev over 10+ years', fired_first: true },
        { bot: 'PBFT_QUORUM', severity: 60, note: 'No external auditor verification of options-strategy fills', fired_first: true },
        { bot: 'INTELLIGENCE_BOT', severity: 75, note: 'SEC whistleblower complaint filed', fired_first: true },
      ],
    },
    {
      month: '2005-10',
      label: 'Oct 2005',
      pre_crime_index: 62,
      headline: 'Markopolos submits expanded 19-page SEC complaint titled "The World\'s Largest Hedge Fund Is a Fraud".',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 90, note: 'Statistical impossibility of reported return profile' },
        { bot: 'INTELLIGENCE_BOT', severity: 80, note: 'Detailed whistleblower documentation submitted to SEC' },
        { bot: 'COMPLIANCE_BOT', severity: 65, note: 'Custody self-clearing — no third-party verification', fired_first: true },
      ],
    },
    {
      month: '2008-12',
      label: 'Dec 2008',
      pre_crime_index: 99,
      headline: 'Madoff confesses to sons; FBI arrests him Dec 11. Largest Ponzi in history confirmed.',
      press: 'Madoff arrest',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 100, note: 'Full madoff pattern: return smoothing + custody control + no audit' },
        { bot: 'COMPLIANCE_BOT', severity: 100, note: 'Self-custody confirmed as concealment mechanism' },
        { bot: 'INTELLIGENCE_BOT', severity: 100, note: 'FBI arrest, public confession' },
        { bot: 'YACHT_GUARDIAN', severity: 100, note: 'Family-only control structure' },
      ],
    },
  ],
}

const STEINHOFF: ReplayCase = {
  slug: 'steinhoff',
  entity: 'Steinhoff International Holdings',
  collapse_date: '2017-12-06',
  collapse_summary: 'CEO Markus Jooste resigns hours before accounts revealed to be inflated by ~€6.5B. Stock loses 95% in days.',
  aum_at_peak: '~€20B market cap (Aug 2016)',
  final_loss: 'Investor losses ~€15B+ · KPMG was the auditor',
  pattern: 'wirecard',
  hero_color: '#ff3366',
  timeline: [
    {
      month: '2015-11',
      label: 'Nov 2015',
      pre_crime_index: 30,
      headline: 'Steinhoff acquires Pepkor and Conforama in rapid debt-financed expansion across Europe.',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 35, note: 'Acquisition pace exceeds organic revenue growth', fired_first: true },
      ],
    },
    {
      month: '2016-12',
      label: 'Dec 2016',
      pre_crime_index: 50,
      headline: 'Manager Magazin (Germany) publishes investigation alleging accounting irregularities and related-party transactions.',
      press: 'Manager Magazin investigation',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 60, note: 'Off-balance-sheet vehicles flagged in German press' },
        { bot: 'INTELLIGENCE_BOT', severity: 75, note: 'Material press allegations published', fired_first: true },
        { bot: 'YACHT_GUARDIAN', severity: 55, note: 'Complex related-party ownership network', fired_first: true },
      ],
    },
    {
      month: '2017-08',
      label: 'Aug 2017',
      pre_crime_index: 62,
      headline: 'German prosecutors raid Steinhoff offices in Hannover and Westerstede.',
      press: 'German prosecutors raid',
      signals: [
        { bot: 'COMPLIANCE_BOT', severity: 80, note: 'Criminal investigation announced publicly', fired_first: true },
        { bot: 'INTELLIGENCE_BOT', severity: 85, note: 'State prosecutor raid is unusually severe signal' },
        { bot: 'NAV_DETECTOR', severity: 70, note: 'Cross-jurisdiction probe reinforces accounting concerns' },
      ],
    },
    {
      month: '2017-12',
      label: 'Dec 2017',
      pre_crime_index: 97,
      headline: 'CEO Markus Jooste resigns. Steinhoff confirms accounting irregularities. Stock falls 95%.',
      press: 'Steinhoff collapse',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 100, note: '€6.5B revenue/asset inflation confirmed — pattern match: wirecard' },
        { bot: 'COMPLIANCE_BOT', severity: 100, note: 'CEO resignation + audit failure' },
        { bot: 'INTELLIGENCE_BOT', severity: 100, note: 'Public confirmation of fraud' },
        { bot: 'YACHT_GUARDIAN', severity: 100, note: 'Jooste and inner circle face criminal charges' },
      ],
    },
  ],
}

const CARILLION: ReplayCase = {
  slug: 'carillion',
  entity: 'Carillion plc',
  collapse_date: '2018-01-15',
  collapse_summary: 'UK government services contractor enters compulsory liquidation. £900M debt + £590M pension deficit. KPMG audited.',
  aum_at_peak: '£5B annual revenue · 43,000 employees',
  final_loss: 'Direct loss ~£1.3B · ripple loss across UK PFI projects',
  pattern: 'greensill',
  hero_color: '#ffaa00',
  timeline: [
    {
      month: '2016-09',
      label: 'Sep 2016',
      pre_crime_index: 32,
      headline: 'Carillion wins multiple new UK government PFI contracts — margins under pressure across all bids.',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 40, note: 'Margin compression on aggressive bid strategy', fired_first: true },
        { bot: 'COMPLIANCE_BOT', severity: 35, note: 'PFI accounting allows aggressive revenue recognition timing', fired_first: true },
      ],
    },
    {
      month: '2017-07',
      label: 'Jul 2017',
      pre_crime_index: 68,
      headline: 'Carillion issues first profit warning — £845M write-down on three problem contracts. Stock down 39%.',
      press: 'First profit warning',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 80, note: '£845M write-down indicates prior accounts were materially wrong' },
        { bot: 'INTELLIGENCE_BOT', severity: 90, note: 'Profit warning + share-price collapse — public signal' },
        { bot: 'COMPLIANCE_BOT', severity: 75, note: 'Multi-contract write-down suggests systemic optimism in revenue recognition' },
        { bot: 'PBFT_QUORUM', severity: 60, note: 'No consensus from market on going-concern status', fired_first: true },
      ],
    },
    {
      month: '2018-01',
      label: 'Jan 2018',
      pre_crime_index: 96,
      headline: 'Carillion enters compulsory liquidation. UK government inherits crisis.',
      press: 'Compulsory liquidation',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 100, note: 'Pattern match: greensill (off-balance-sheet PFI receivables collapse)' },
        { bot: 'COMPLIANCE_BOT', severity: 100, note: 'KPMG audit later fined £14.4M by FRC for failure' },
        { bot: 'INTELLIGENCE_BOT', severity: 100, note: 'Compulsory liquidation public' },
      ],
    },
  ],
}

const NMC_HEALTH: ReplayCase = {
  slug: 'nmc-health',
  entity: 'NMC Health plc',
  collapse_date: '2020-04-09',
  collapse_summary: 'UAE hospital chain listed on FTSE 100 collapsed after $4B in undisclosed debt revealed. Founder BR Shetty faces fraud charges.',
  aum_at_peak: '£10B market cap (Aug 2018)',
  final_loss: 'Shareholder loss ~£8B · ~$4B undisclosed debt',
  pattern: 'wirecard',
  hero_color: '#9b6dff',
  timeline: [
    {
      month: '2019-04',
      label: 'Apr 2019',
      pre_crime_index: 35,
      headline: 'NMC Health enters FTSE 100. Aggressive M&A in UAE and India.',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 38, note: 'Acquisition velocity outpaces underlying revenue base', fired_first: true },
        { bot: 'YACHT_GUARDIAN', severity: 45, note: 'Founder ownership chain through UAE family holding opaque', fired_first: true },
      ],
    },
    {
      month: '2019-12',
      label: 'Dec 2019',
      pre_crime_index: 72,
      headline: 'Muddy Waters Research publishes short report: NMC accounts materially misrepresent debt and assets.',
      press: 'Muddy Waters short report',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 88, note: 'Short report alleges $2B undisclosed debt + asset overstatement' },
        { bot: 'INTELLIGENCE_BOT', severity: 92, note: 'Credible short-seller report (Muddy Waters)', fired_first: false },
        { bot: 'COMPLIANCE_BOT', severity: 75, note: 'Audit by EY did not catch alleged misstatements', fired_first: true },
        { bot: 'SHADOW_BOT', severity: 70, note: 'Adversarial probe by external analyst signals integrity gap', fired_first: true },
      ],
    },
    {
      month: '2020-04',
      label: 'Apr 2020',
      pre_crime_index: 95,
      headline: 'NMC Health placed in administration. Confirmed $4B+ undisclosed debt. FCA opens investigation.',
      press: 'Administration filed',
      signals: [
        { bot: 'NAV_DETECTOR', severity: 100, note: 'Confirmed pattern: wirecard (undisclosed debt + phantom revenue)' },
        { bot: 'COMPLIANCE_BOT', severity: 100, note: 'FCA investigation opened' },
        { bot: 'YACHT_GUARDIAN', severity: 100, note: 'Founder Shetty faces criminal charges' },
        { bot: 'INTELLIGENCE_BOT', severity: 100, note: 'Public administration filing' },
      ],
    },
  ],
}

export const REPLAY_CASES: ReplayCase[] = [WIRECARD, ARCHEGOS, FTX, GREENSILL, MADOFF, STEINHOFF, CARILLION, NMC_HEALTH]

export function getCase(slug: string): ReplayCase | null {
  return REPLAY_CASES.find(c => c.slug === slug) ?? null
}
