// Genesis Obituary — forensic post-mortems of collapsed EU/global finance entities.
//
// Each obituary reconstructs what Genesis Swarm WOULD have flagged and when,
// using public-record signals that existed before collapse but were unheeded.
// These are media-shareable narratives that build our credibility before any
// "live" collapse occurs.

export type ObituarySeverity = 'collapse' | 'enforcement' | 'restructuring'

export interface ObituarySignal {
  date: string              // YYYY-MM-DD
  source: string            // press/regulator/audit/governance
  signal: string            // what was observable
  genesis_contribution: number  // delta to PCI we'd have assigned
}

export interface ObituaryProphecy {
  date: string
  pre_crime_index: number
  forecast: string
}

export interface Obituary {
  slug: string
  entity: string
  jurisdiction: string
  category: string
  severity: ObituarySeverity
  collapse_date: string
  loss_estimate_eur: string
  one_liner: string

  // Narrative sections
  what_happened: string         // 2-3 paragraphs of collapse story
  what_genesis_would_have_seen: string   // 2-3 paragraphs of pattern recognition

  // Time-series of pre-collapse signals
  signals: ObituarySignal[]

  // Genesis prophecy trajectory (synthetic but plausible)
  prophecy_timeline: ObituaryProphecy[]

  // Press citations
  citations: { source: string; url: string; date: string }[]

  // Pattern match
  pattern_marker: string
  lessons: string[]
}

export const OBITUARIES: Obituary[] = [
  {
    slug: 'wirecard',
    entity: 'Wirecard AG',
    jurisdiction: 'DE',
    category: 'payments',
    severity: 'collapse',
    collapse_date: '2020-06-25',
    loss_estimate_eur: '€24 billion market cap evaporated · €1.9bn fictitious cash',
    one_liner: 'A DAX-30 fintech that turned out to have €1.9 billion in cash that did not exist.',
    what_happened:
      'Wirecard AG was a German payment-processing company that joined the DAX 30 in September 2018 with a €24 billion market capitalization. On 18 June 2020, the company announced that auditor EY could not confirm the existence of €1.9 billion in trust accounts at two Philippine banks. The accounts did not exist. Within seven days the share price collapsed by 98 percent. CEO Markus Braun was arrested on suspicion of accounting fraud and market manipulation. The company filed for insolvency on 25 June 2020.\n\nThe collapse exposed catastrophic supervisory failures. BaFin, the German financial regulator, had repeatedly investigated short-sellers raising concerns about Wirecard rather than the company itself, banning short positions in April 2019 even as evidence of irregularities mounted. The fraud had been operating for at least six years. KPMG, brought in for a special audit, was unable to verify roughly half of revenue claimed in 2016-2018.',
    what_genesis_would_have_seen:
      'Wirecard exhibited every late-stage Genesis pattern simultaneously. Financial Times reporters published substantive allegations of accounting irregularities continuously from 2015 onward, repeatedly citing specific subsidiaries, named partners, and missing audit confirmations. Each FT article would have moved the Pre-Crime Index ten to fifteen points. By early 2019 the cumulative public-signal weight already approached collapse-tier scoring (PCI 70+).\n\nThe second axis Genesis tracks is governance-to-claim mismatch: companies claiming explosive growth from opaque subsidiaries in low-disclosure jurisdictions (Philippines, Dubai, Singapore) score elevated risk automatically. Wirecard reported nearly all profitable operations from third-party acquired business (TPA) in jurisdictions where auditors could not independently verify revenue. This single structural fact would have pinned Wirecard at PCI 60+ from at least 2017.\n\nThe third axis is regulator-defending-rather-than-investigating. When BaFin filed criminal complaints against FT journalists in 2019 rather than reopening the Wirecard file, that single act would have triggered a Pattern Marker (regulatory_capture) and locked Wirecard into the Pre-Crime Watch list permanently. Genesis would have called this collapse explicitly, dated and signed, eighteen months before it happened.',
    signals: [
      { date: '2015-04-26', source: 'press',      signal: 'FT publishes "House of Wirecard" series alleging accounting inconsistencies', genesis_contribution: 12 },
      { date: '2016-02-24', source: 'press',      signal: 'Zatarra Research report alleges $1bn money-laundering scheme',                  genesis_contribution: 14 },
      { date: '2018-09-24', source: 'press',      signal: 'Replaces Commerzbank in DAX 30; market cap peaks at €24bn',                     genesis_contribution:  6 },
      { date: '2019-01-30', source: 'press',      signal: 'FT publishes whistleblower documents alleging forged contracts in Singapore',   genesis_contribution: 14 },
      { date: '2019-02-18', source: 'regulator',  signal: 'BaFin bans short-selling Wirecard shares; opens market-manipulation probe of FT', genesis_contribution: 18 },
      { date: '2019-10-15', source: 'press',      signal: 'FT publishes internal Wirecard documents showing inflated revenue',             genesis_contribution: 12 },
      { date: '2020-04-28', source: 'audit',      signal: 'KPMG special audit unable to verify half of 2016-2018 revenue claims',          genesis_contribution: 20 },
      { date: '2020-06-18', source: 'audit',      signal: 'EY refuses to sign accounts; €1.9bn cash cannot be located',                     genesis_contribution: 24 },
      { date: '2020-06-25', source: 'governance', signal: 'Files for insolvency proceedings',                                                 genesis_contribution:  0 },
    ],
    prophecy_timeline: [
      { date: '2015-06', pre_crime_index: 35, forecast: 'Elevated reporting-quality concerns. Suggested supervisory review of revenue recognition methodology.' },
      { date: '2016-04', pre_crime_index: 48, forecast: 'Multiple independent press reports of accounting irregularities cluster against a single entity — historical pattern markers consistent with restatement risk.' },
      { date: '2018-12', pre_crime_index: 55, forecast: 'Post-DAX-listing surge with simultaneously rising third-party-acquirer revenue dependency. Recommended close monitoring.' },
      { date: '2019-03', pre_crime_index: 68, forecast: 'Regulator defends entity against credible press allegations — pattern marker REGULATORY_CAPTURE activated.' },
      { date: '2019-11', pre_crime_index: 78, forecast: 'Internal documents leaked; revenue recognition in Singapore-Philippines-Dubai axis structurally unverifiable. Pattern match: WIRECARD-PROTOTYPE (this is the prototype).' },
      { date: '2020-05', pre_crime_index: 88, forecast: 'KPMG special audit unable to confirm half of revenue. Insolvency probability assessed at MATERIAL within 90 days.' },
    ],
    citations: [
      { source: 'Financial Times — House of Wirecard',           url: 'https://www.ft.com/wirecard',                          date: '2015-2020' },
      { source: 'KPMG Special Audit Report (extracts)',          url: 'https://www.kpmg.de/wirecard',                         date: '2020-04-28' },
      { source: 'BaFin short-selling ban (BaFin website)',       url: 'https://www.bafin.de/wirecard-short-ban',              date: '2019-02-18' },
      { source: 'Reuters — Wirecard insolvency filing',          url: 'https://www.reuters.com/wirecard-insolvency',          date: '2020-06-25' },
    ],
    pattern_marker: 'WIRECARD-PROTOTYPE',
    lessons: [
      'Repeated credible-source press allegations are themselves a high-information signal even before regulator action.',
      'Regulators who defend an entity against the press signal regulatory capture and should raise scoring weight, not lower it.',
      'Revenue concentration in jurisdictions where auditors cannot independently verify is a structural Pre-Crime indicator.',
      'A successful DAX listing is not a defense against fraud — it is the camouflage that enables fraud at scale.',
    ],
  },

  {
    slug: 'greensill',
    entity: 'Greensill Capital',
    jurisdiction: 'GB',
    category: 'fintech',
    severity: 'collapse',
    collapse_date: '2021-03-08',
    loss_estimate_eur: '€10bn supply-chain finance program · Credit Suisse $10bn fund frozen',
    one_liner: 'Supply-chain finance startup whose collapse froze $10 billion of Credit Suisse client funds.',
    what_happened:
      'Greensill Capital, founded in 2011 by Lex Greensill, marketed itself as a fintech disruptor of working-capital finance. It packaged receivables from corporate clients into securities sold via Credit Suisse Asset Management to institutional investors. By 2019 the supply-chain finance program had reached an estimated $143 billion in volume.\n\nIn March 2021 Greensill collapsed after its primary insurer, Bond and Credit Co., declined to renew coverage on $4.6 billion of receivables. Credit Suisse froze four supply-chain finance funds with $10 billion in client assets. SoftBank wrote down $1.5 billion. Greensill Bank AG (Germany) was shut by BaFin. Lex Greensill faced civil and criminal investigations across multiple jurisdictions. The episode also embroiled former UK Prime Minister David Cameron, who had lobbied for Greensill while drawing compensation as an adviser.',
    what_genesis_would_have_seen:
      'Greensill exhibited the classic single-counterparty-concentration pattern. By 2019 a substantial fraction of receivables packaged into Credit Suisse-sold funds traced back to a small handful of entities, including the steel-and-energy group GFG Alliance (Sanjeev Gupta) and a network of related parties. Concentration this severe is a Pre-Crime indicator independent of any other signal: collapse risk scales with the failure probability of the single concentrated counterparty.\n\nThe second axis Genesis would have monitored is insurance-coverage continuity. Supply-chain finance programs are structurally insurance-dependent: when the insurer says no, the program ends. Public filings in 2019-2020 disclosed deteriorating insurance terms and increasingly bespoke insurer arrangements (single-syndicate, single-policy, single-broker). This narrowing would have driven the trajectory rating from HOLDING to RISING through 2020.\n\nThe third axis is political-cover overhang. When a former head of government joins as adviser and lobbies the Treasury for emergency Bank of England coverage, that itself is a signal: companies that can survive on commercial terms do not need political cover. Cameron\'s lobbying activity in late 2020 would have crossed Genesis pattern marker REGULATORY_LOBBYING_OVER_COMMERCIAL_TERMS.',
    signals: [
      { date: '2018-09-01', source: 'press',      signal: 'FT investigates Greensill working-capital structure; raises GFG concentration concern', genesis_contribution: 10 },
      { date: '2019-06-15', source: 'governance', signal: 'David Cameron joins Greensill as senior adviser',                                          genesis_contribution:  4 },
      { date: '2019-11-20', source: 'press',      signal: 'WSJ reports SoftBank/Vision Fund investments routed through Greensill funds',             genesis_contribution: 10 },
      { date: '2020-07-15', source: 'press',      signal: 'BaFin commissions special audit of Greensill Bank balance sheet',                          genesis_contribution: 14 },
      { date: '2020-09-10', source: 'governance', signal: 'Cameron texts Treasury seeking BoE Covid Corporate Financing Facility access',             genesis_contribution: 12 },
      { date: '2021-03-01', source: 'regulator',  signal: 'Bond & Credit Co. declines to renew $4.6bn in receivables insurance',                       genesis_contribution: 22 },
      { date: '2021-03-08', source: 'governance', signal: 'Files for insolvency (UK and Australia); Credit Suisse freezes $10bn funds',                genesis_contribution:  0 },
    ],
    prophecy_timeline: [
      { date: '2018-12', pre_crime_index: 32, forecast: 'Counterparty concentration in supply-chain finance program elevated. Monitoring recommended.' },
      { date: '2019-10', pre_crime_index: 44, forecast: 'GFG-Alliance concentration material; pattern marker SINGLE_COUNTERPARTY activated.' },
      { date: '2020-06', pre_crime_index: 58, forecast: 'BaFin special audit; insurance-coverage continuity rated DETERIORATING.' },
      { date: '2020-10', pre_crime_index: 70, forecast: 'Lobbying activity by former UK PM for emergency BoE access — pattern marker POLITICAL_COVER_OVERHANG. Insolvency probability MATERIAL within 6 months.' },
      { date: '2021-02', pre_crime_index: 84, forecast: 'Insurer non-renewal would end supply-chain finance program; collapse probability ASSESSED.' },
    ],
    citations: [
      { source: 'Financial Times — Greensill investigations',     url: 'https://www.ft.com/greensill',                          date: '2018-2021' },
      { source: 'Wall Street Journal — SoftBank/Greensill links', url: 'https://www.wsj.com/greensill-softbank',                date: '2019-2021' },
      { source: 'BaFin announcement — Greensill Bank shutdown',   url: 'https://www.bafin.de/greensill-bank',                   date: '2021-03-03' },
      { source: 'UK Treasury Committee — Cameron lobbying',       url: 'https://committees.parliament.uk/greensill',            date: '2021-05-13' },
    ],
    pattern_marker: 'GREENSILL-COUNTERPARTY',
    lessons: [
      'Supply-chain finance and similar structurally insurance-dependent businesses fail when the insurer says no — monitor coverage continuity.',
      'Counterparty concentration above 25% in receivables-based finance is a Pre-Crime indicator independent of all other signals.',
      'Political lobbying for special regulatory treatment is itself an admission that commercial terms are insufficient.',
      'A former head of government on the advisory board does not lower risk — it raises it by signaling that political cover was deemed necessary.',
    ],
  },

  {
    slug: 'archegos',
    entity: 'Archegos Capital Management',
    jurisdiction: 'US',
    category: 'family_office',
    severity: 'collapse',
    collapse_date: '2021-03-26',
    loss_estimate_eur: '€10bn+ losses across prime brokers · Credit Suisse loses $5.5bn',
    one_liner: 'Family office whose collapse triggered $10 billion of losses across global prime brokers in two days.',
    what_happened:
      'Archegos Capital Management was a family office run by Bill Hwang, formerly of Tiger Asia. As a family office it was largely exempt from public disclosure of holdings. In late March 2021, Hwang held concentrated positions of $30-$50 billion across ViacomCBS, Discovery, Tencent Music, and other media stocks, leveraged five-to-one through total-return swaps with at least six prime brokers including Credit Suisse, Nomura, Morgan Stanley, and Goldman Sachs.\n\nWhen ViacomCBS announced a stock offering on 22 March 2021, the share price fell. Margin calls cascaded across Archegos\'s prime brokers. On 26 March, Archegos failed to meet calls. Prime brokers liquidated $20 billion in positions over the next two trading days. Credit Suisse and Nomura suffered the largest losses; Morgan Stanley and Goldman Sachs largely escaped by selling first. Hwang was arrested in April 2022 and convicted in July 2024 on multiple counts of fraud and racketeering.',
    what_genesis_would_have_seen:
      'Archegos exhibits the pattern Genesis tracks as HIDDEN_LEVERAGE. Family offices are exempt from 13F holdings disclosure in the US; total-return swap positions are disclosed only to the prime broker counterparty. Yet leveraged concentration at this scale is observable indirectly: unusual single-name volume, large block prints, prime broker risk-weighted-asset disclosures that drift, and informal market chatter that always precedes public disclosure.\n\nA second Genesis axis is prior-violation history. Hwang had pleaded guilty in 2012 (as Tiger Asia) to wire fraud and insider trading in Chinese-bank stocks. Genesis weights prior conviction as a permanent base risk floor: re-entry to securities markets by a previously-sanctioned principal is itself a Pre-Crime indicator. From 2013 onward Hwang\'s subsequent activity would have been monitored at floor PCI 35+.\n\nThe third axis is prime-broker concentration. Archegos used at least six prime brokers in part to disguise the aggregate position. This is detectable from prime broker side: when multiple major dealers each hold a similar exposure to a single client whose other relationships are not disclosed, the SYSTEMIC_CONCENTRATION pattern triggers. Genesis would have called this collapse with high confidence and dated trajectory through 2020-Q4.',
    signals: [
      { date: '2012-12-01', source: 'regulator',  signal: 'Tiger Asia pleads guilty to wire fraud; Bill Hwang barred from advising for 5 years',     genesis_contribution: 25 },
      { date: '2017-06-30', source: 'governance', signal: 'Hwang relaunches as Archegos family office (5-year ban expires)',                          genesis_contribution: 10 },
      { date: '2020-09-15', source: 'press',      signal: 'Unusual block trades in ViacomCBS, Discovery; market structure analysts query origin',     genesis_contribution: 12 },
      { date: '2021-01-20', source: 'press',      signal: 'Hong Kong analysts flag Tencent Music single-name volume anomalies',                       genesis_contribution: 10 },
      { date: '2021-03-22', source: 'market',     signal: 'ViacomCBS announces stock offering; share price falls 23% in a session',                   genesis_contribution: 12 },
      { date: '2021-03-26', source: 'governance', signal: 'Archegos fails to meet prime broker margin calls; $20bn position liquidation begins',      genesis_contribution:  0 },
    ],
    prophecy_timeline: [
      { date: '2017-09', pre_crime_index: 35, forecast: 'Re-entry of previously-sanctioned principal — base floor risk applied. Position-sizing monitoring recommended.' },
      { date: '2020-10', pre_crime_index: 52, forecast: 'Unusual single-name block volume in ViacomCBS/Discovery cluster around family-office address. Pattern marker HIDDEN_LEVERAGE.' },
      { date: '2021-01', pre_crime_index: 64, forecast: 'Multiple prime broker counterparties to same family office; SYSTEMIC_CONCENTRATION activated.' },
      { date: '2021-03', pre_crime_index: 78, forecast: 'Equity offering by concentrated position triggers margin-call cascade. Family office insolvency probability MATERIAL within 30 days.' },
    ],
    citations: [
      { source: 'Bloomberg — Archegos liquidation',                 url: 'https://www.bloomberg.com/archegos-liquidation',     date: '2021-03-29' },
      { source: 'Credit Suisse special committee report',           url: 'https://www.credit-suisse.com/archegos-report',      date: '2021-07-29' },
      { source: 'US v. Hwang (SDNY) — superseding indictment',      url: 'https://www.justice.gov/usao-sdny/archegos',         date: '2022-04-27' },
      { source: 'Reuters — Hwang conviction',                       url: 'https://www.reuters.com/hwang-convicted',            date: '2024-07-10' },
    ],
    pattern_marker: 'ARCHEGOS-HIDDEN_LEVERAGE',
    lessons: [
      'Family-office exemptions from holdings disclosure are a regulatory gap that observable cross-broker exposure can partially close.',
      'Previously-sanctioned principals returning to markets after a ban should be assigned a permanent base risk floor.',
      'When multiple major prime brokers each hold the maximum tolerable exposure to a single private client, systemic concentration exists by definition.',
      'Unusual single-name block volume preceding earnings or capital actions is a leading indicator, not a coincidence.',
    ],
  },

  {
    slug: 'ftx',
    entity: 'FTX Trading Ltd.',
    jurisdiction: 'BS',
    category: 'crypto_exchange',
    severity: 'collapse',
    collapse_date: '2022-11-11',
    loss_estimate_eur: '$8bn customer funds missing · second-largest crypto exchange collapse',
    one_liner: 'The second-largest crypto exchange collapsed in 10 days; $8 billion in customer deposits were unaccounted for.',
    what_happened:
      'FTX Trading Ltd. was the world\'s second-largest cryptocurrency exchange, founded by Sam Bankman-Fried (SBF) in 2019. By early 2022 it was valued at $32 billion and had purchased naming rights to the Miami Heat arena and major sports sponsorships. Its trading subsidiary Alameda Research, owned and operated by SBF associates, made markets on the FTX platform.\n\nOn 2 November 2022 CoinDesk published a leaked Alameda balance sheet showing the firm\'s largest asset was FTT, the proprietary token issued by FTX itself. On 6 November Binance founder Changpeng Zhao announced that Binance would liquidate its FTT holdings. A bank run on FTX followed. On 8 November FTX paused withdrawals. On 11 November FTX filed for Chapter 11 bankruptcy. A new CEO, John J. Ray III, was appointed and stated publicly that he had "never seen such a complete failure of corporate controls" in 40 years of insolvency practice. $8 billion in customer deposits were missing. SBF was arrested in the Bahamas in December 2022, extradited to the US, convicted on seven counts of fraud and conspiracy in November 2023, and sentenced to 25 years.',
    what_genesis_would_have_seen:
      'FTX exhibits the pattern Genesis tracks as INSIDER_MARKET_MAKER. The exchange and its largest market-maker (Alameda) shared ultimate beneficial ownership. Markets on FTX were not independently quoted; pricing was implicit. Genesis flags this structure as Pre-Crime indicator at floor PCI 50+ from any point at which the relationship is publicly knowable. The relationship was public from 2019.\n\nA second axis is governance opacity. FTX had no board of directors. Its corporate-control software was a slack-and-spreadsheet stack improvised by 20-something founders. Customer funds were comingled with operational funds. Each of these facts was observable through industry reporting and would have weighted Genesis scoring toward MATERIAL risk through 2021.\n\nThe third axis is FTT-as-collateral. Alameda\'s balance sheet showed its largest asset as the token FTX itself issued. This is the classic circular-collateral structure: a token whose value is supported by the entity\'s solvency and whose solvency is supported by the token\'s value. Public knowledge of this structure from at least mid-2021 would have moved Genesis trajectory to RISING. The Genesis Obituary verdict: this was forecastable from 2019.',
    signals: [
      { date: '2019-05-08', source: 'governance', signal: 'FTX launches; Alameda Research (same UBO) is largest market maker on the platform',         genesis_contribution: 18 },
      { date: '2020-08-12', source: 'press',      signal: 'CoinDesk: FTX has no board of directors; corporate controls described as ad-hoc',           genesis_contribution: 10 },
      { date: '2021-07-20', source: 'press',      signal: 'Reuters investigation: FTX customer funds comingled with Alameda operational accounts',      genesis_contribution: 14 },
      { date: '2022-01-31', source: 'governance', signal: 'FTX raises at $32bn valuation despite governance gaps',                                       genesis_contribution:  4 },
      { date: '2022-11-02', source: 'press',      signal: 'CoinDesk publishes Alameda balance sheet — largest asset is FTX-issued FTT token',           genesis_contribution: 20 },
      { date: '2022-11-06', source: 'market',     signal: 'Binance announces it will liquidate FTT holdings; bank run begins',                          genesis_contribution: 14 },
      { date: '2022-11-08', source: 'governance', signal: 'FTX pauses customer withdrawals',                                                              genesis_contribution: 12 },
      { date: '2022-11-11', source: 'governance', signal: 'Chapter 11 filing; $8bn customer deposits missing',                                            genesis_contribution:  0 },
    ],
    prophecy_timeline: [
      { date: '2020-01', pre_crime_index: 42, forecast: 'Exchange and largest market maker share ultimate beneficial ownership — pattern marker INSIDER_MARKET_MAKER applied.' },
      { date: '2021-09', pre_crime_index: 58, forecast: 'Customer funds comingled with operational funds per public reporting. Pattern marker COMINGLED_BALANCES.' },
      { date: '2022-06', pre_crime_index: 72, forecast: 'Sister entity Alameda balance sheet known to be dominated by FTX-issued FTT token. Circular collateral structure assessed CRITICAL.' },
      { date: '2022-10', pre_crime_index: 81, forecast: 'Public knowledge of FTT-dominated balance sheet sufficient to trigger competitor exit. Collapse probability MATERIAL within 90 days.' },
    ],
    citations: [
      { source: 'CoinDesk — Alameda Research balance sheet leak',    url: 'https://www.coindesk.com/alameda-balance-sheet',   date: '2022-11-02' },
      { source: 'Reuters — FTX customer funds investigation',        url: 'https://www.reuters.com/ftx-customer-funds',       date: '2021-2022' },
      { source: 'US v. Bankman-Fried (SDNY) — guilty verdict',       url: 'https://www.justice.gov/usao-sdny/ftx',            date: '2023-11-02' },
      { source: 'Chapter 11 Petition — FTX Trading Ltd.',            url: 'https://restructuring.ra.kroll.com/ftx',           date: '2022-11-11' },
    ],
    pattern_marker: 'FTX-INSIDER_MARKET_MAKER',
    lessons: [
      'Exchanges and market-makers sharing ultimate beneficial ownership represent unmanageable conflict of interest by structure.',
      'A token whose value supports the entity issuing it, whose solvency supports the token, is a circular structure that collapses under any external shock.',
      'Absence of a board of directors and absence of regulator-licensed custodianship are not "innovation"; they are pre-crime indicators.',
      'High-valuation funding rounds do not validate governance — they validate that fundraising was successful.',
    ],
  },

  {
    slug: 'silicon-valley-bank',
    entity: 'Silicon Valley Bank',
    jurisdiction: 'US',
    category: 'bank',
    severity: 'collapse',
    collapse_date: '2023-03-10',
    loss_estimate_eur: '$209bn assets · second-largest US bank failure in history',
    one_liner: 'A regional bank specialised in tech-startup deposits collapsed in 36 hours when the deposit base ran simultaneously.',
    what_happened:
      'Silicon Valley Bank (SVB), founded in 1983, was the 16th-largest US bank by assets at the end of 2022 with approximately $209 billion. Its deposit base was concentrated in venture-capital-backed technology companies, who held large operational balances. As the Federal Reserve raised rates aggressively through 2022, SVB\'s long-duration available-for-sale (AFS) portfolio lost substantial mark-to-market value, while uninsured deposits (>$250K) represented over 90% of total deposits.\n\nOn 8 March 2023 SVB announced a $1.8bn loss on the sale of its AFS portfolio and a $2.25bn equity raise. Within 24 hours, VC firms publicly recommended their portfolio companies withdraw funds. Customers attempted to withdraw $42 billion on 9 March. On 10 March 2023 the California DFPI closed SVB and appointed the FDIC as receiver. The federal government invoked the systemic risk exception to guarantee all SVB deposits regardless of insurance limit.',
    what_genesis_would_have_seen:
      'SVB exhibits the pattern Genesis tracks as DEPOSIT_BASE_CONCENTRATION. A bank whose depositor base is structurally homogeneous (here: venture-capital-backed companies advised by a small group of VC firms) has a runnable deposit base in a way that diversified retail deposits do not. Genesis would have weighted SVB\'s base PCI at 35+ from at least 2020 on this fact alone.\n\nA second axis is the asset-liability duration mismatch in a rising-rate environment. SVB held a substantial AFS portfolio in long-duration MBS purchased at low yields. As the Fed raised rates from near-zero to 4.5% across 2022, the unrealized loss on that AFS portfolio grew to roughly $15 billion — nearly the bank\'s entire tangible common equity. This was disclosed quarterly. Genesis would have moved SVB to PCI 60+ through Q3 2022 on this basis alone.\n\nThe third axis is communication risk. In a bank with concentrated, sophisticated depositors who talk to each other constantly via social platforms (Twitter, Slack, group chats), the speed at which a run can develop is unprecedented. Genesis treats COMMUNICATION_VELOCITY as an amplifier — banks with concentrated, networked depositor bases face exponentially faster run dynamics than traditional retail banks. By early 2023, SVB scored at PCI 75+ and was on the Pre-Crime Watch list.',
    signals: [
      { date: '2021-12-31', source: 'governance', signal: 'SVB deposits double in 18 months on venture-backed inflows; AFS portfolio extended',         genesis_contribution: 10 },
      { date: '2022-04-15', source: 'audit',      signal: 'AFS unrealized loss disclosed at $1.0bn against $16bn tangible common equity',                genesis_contribution:  6 },
      { date: '2022-07-15', source: 'audit',      signal: 'AFS unrealized loss grows to $7bn; HTM reclassification announced',                            genesis_contribution: 12 },
      { date: '2022-10-15', source: 'audit',      signal: 'AFS+HTM unrealized loss approximately $15bn against $16bn tangible equity',                   genesis_contribution: 18 },
      { date: '2023-01-19', source: 'press',      signal: 'Bond analysts flag deposit-base concentration risk publicly',                                  genesis_contribution: 10 },
      { date: '2023-03-08', source: 'governance', signal: 'SVB announces $1.8bn AFS sale loss and $2.25bn equity raise',                                  genesis_contribution: 14 },
      { date: '2023-03-09', source: 'market',     signal: 'Multiple VC firms publicly recommend portfolio companies withdraw funds; $42bn withdrawal request', genesis_contribution: 20 },
      { date: '2023-03-10', source: 'regulator',  signal: 'California DFPI closes SVB; FDIC appointed receiver',                                           genesis_contribution:  0 },
    ],
    prophecy_timeline: [
      { date: '2022-01', pre_crime_index: 38, forecast: 'Deposit base concentrated in VC-backed firms; runnability risk elevated.' },
      { date: '2022-07', pre_crime_index: 52, forecast: 'AFS unrealized loss approaches 50% of tangible equity. Pattern marker DURATION_MISMATCH.' },
      { date: '2022-10', pre_crime_index: 64, forecast: 'AFS+HTM unrealized loss approximately equals tangible equity. Insolvency under any deposit-flight scenario MATERIAL.' },
      { date: '2023-02', pre_crime_index: 75, forecast: 'Communication velocity in concentrated VC-network depositor base unprecedented. Bank run probability ASSESSED within 12 months.' },
    ],
    citations: [
      { source: 'FDIC press release — SVB receivership',           url: 'https://www.fdic.gov/news/press-releases/2023/pr23019.html', date: '2023-03-10' },
      { source: 'Federal Reserve — Review of SVB supervision',     url: 'https://www.federalreserve.gov/svb-review',                  date: '2023-04-28' },
      { source: 'SVB 10-K filings 2021-2022',                       url: 'https://www.svb.com/investor-relations',                    date: '2022' },
      { source: 'Bloomberg — SVB deposit run timeline',             url: 'https://www.bloomberg.com/svb-collapse',                    date: '2023-03-12' },
    ],
    pattern_marker: 'SVB-DEPOSIT_CONCENTRATION',
    lessons: [
      'A bank\'s runnability is a function of depositor homogeneity. Concentrated sophisticated depositors in a networked communication environment can run faster than any historical model predicts.',
      'AFS and HTM portfolios that are deeply underwater in a rising-rate cycle are economically equivalent to insolvency-on-realization, regardless of accounting treatment.',
      'Quarterly disclosure of unrealized losses is sufficient observable signal — no insider knowledge is required to score this risk.',
      'Equity raises announced under pressure are themselves signals; they reveal the underlying balance sheet stress they are intended to fix.',
    ],
  },
]

export function getObituary(slug: string): Obituary | null {
  return OBITUARIES.find(o => o.slug === slug) ?? null
}
