// THE BOOK OF GENESIS — 100 sealed prophecies on named EU financial entities.
// Curated across asset managers, banks, insurers, PE, real estate, wealth.
// LEIs verified against GLEIF where available; resolved at scoring time when not.

export interface BookCandidate {
  name: string
  lei?: string
  jurisdiction: string
  category: 'asset_mgmt' | 'bank' | 'insurance' | 'private_equity' | 'real_estate' | 'wealth' | 'depositary'
}

export const BOOK_CANDIDATES: BookCandidate[] = [
  // ─── ASSET MANAGEMENT (35) ────────────────────────────────────────
  { name: 'BlackRock Investment Management (UK) Limited', lei: '529900VBK42Y5HHRMD23', jurisdiction: 'GB', category: 'asset_mgmt' },
  { name: 'Amundi Asset Management',                              jurisdiction: 'FR', category: 'asset_mgmt' },
  { name: 'Schroder Investment Management (Europe) S.A.',         jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'AXA Investment Managers Paris',                        jurisdiction: 'FR', category: 'asset_mgmt' },
  { name: 'BNP Paribas Asset Management Holding',                 jurisdiction: 'FR', category: 'asset_mgmt' },
  { name: 'Allianz Global Investors GmbH',                        jurisdiction: 'DE', category: 'asset_mgmt' },
  { name: 'DWS Group GmbH & Co. KGaA',                             jurisdiction: 'DE', category: 'asset_mgmt' },
  { name: 'UBS Asset Management (Europe) S.A.',                   jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Pictet Asset Management S.A.',                         jurisdiction: 'CH', category: 'asset_mgmt' },
  { name: 'Carmignac Gestion Luxembourg',                         jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'M&G Investments',                                       jurisdiction: 'GB', category: 'asset_mgmt' },
  { name: 'abrdn Investments Luxembourg S.A.',                    jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Robeco Institutional Asset Management',                jurisdiction: 'NL', category: 'asset_mgmt' },
  { name: 'NN Investment Partners B.V.',                          jurisdiction: 'NL', category: 'asset_mgmt' },
  { name: 'La Française AM',                                       jurisdiction: 'FR', category: 'asset_mgmt' },
  { name: 'Comgest S.A.',                                          jurisdiction: 'FR', category: 'asset_mgmt' },
  { name: 'ODDO BHF Asset Management',                            jurisdiction: 'FR', category: 'asset_mgmt' },
  { name: 'Edmond de Rothschild Asset Management',                jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Mirabaud Asset Management (Europe)',                   jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Lyxor International Asset Management',                  jurisdiction: 'FR', category: 'asset_mgmt' },
  { name: 'CACEIS Investor Services',                             jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Anima Holding S.p.A.',                                  jurisdiction: 'IT', category: 'asset_mgmt' },
  { name: 'Banca Generali Fund Management',                       jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Eurizon Capital S.A.',                                  jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Azimut Investments S.A.',                              jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Union Investment Luxembourg S.A.',                     jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Allianz Life Luxembourg S.A.',                          jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'Deka Investment GmbH',                                  jurisdiction: 'DE', category: 'asset_mgmt' },
  { name: 'Universal-Investment-Gesellschaft mbH',                jurisdiction: 'DE', category: 'asset_mgmt' },
  { name: 'Janus Henderson Investors UK',                         jurisdiction: 'GB', category: 'asset_mgmt' },
  { name: 'Jupiter Asset Management',                             jurisdiction: 'GB', category: 'asset_mgmt' },
  { name: 'Liontrust Investment Partners',                         jurisdiction: 'GB', category: 'asset_mgmt' },
  { name: 'Quilter Investors Limited',                            jurisdiction: 'GB', category: 'asset_mgmt' },
  { name: 'Allfunds Bank International',                          jurisdiction: 'LU', category: 'asset_mgmt' },
  { name: 'KBC Asset Management N.V.',                             jurisdiction: 'BE', category: 'asset_mgmt' },

  // ─── BANKING (25) ─────────────────────────────────────────────────
  { name: 'JPMorgan Chase Bank, N.A. (London Branch)',            lei: '7H6GLXDRUGQFU57RNE97', jurisdiction: 'GB', category: 'bank' },
  { name: 'Goldman Sachs Bank Europe SE',                         jurisdiction: 'DE', category: 'bank' },
  { name: 'Citibank Europe plc',                                   jurisdiction: 'IE', category: 'bank' },
  { name: 'Société Générale Luxembourg',                          jurisdiction: 'LU', category: 'bank' },
  { name: 'Deutsche Bank AG, London Branch',                      jurisdiction: 'GB', category: 'bank' },
  { name: 'UBS Europe SE',                                         jurisdiction: 'DE', category: 'bank' },
  { name: 'BNP Paribas S.A. Luxembourg',                          jurisdiction: 'LU', category: 'bank' },
  { name: 'Banque Internationale à Luxembourg',                   lei: '5493000F4ZO33MV32P92', jurisdiction: 'LU', category: 'bank' },
  { name: 'Quintet Private Bank (Europe) S.A.',                   jurisdiction: 'LU', category: 'bank' },
  { name: 'Banque de Luxembourg S.A.',                            jurisdiction: 'LU', category: 'bank' },
  { name: 'Banque Havilland S.A.',                                jurisdiction: 'LU', category: 'bank' },
  { name: 'ING Luxembourg S.A.',                                   jurisdiction: 'LU', category: 'bank' },
  { name: 'ABN AMRO Bank N.V.',                                    jurisdiction: 'NL', category: 'bank' },
  { name: 'Rabobank',                                              jurisdiction: 'NL', category: 'bank' },
  { name: 'Nordea Bank Abp',                                       jurisdiction: 'FI', category: 'bank' },
  { name: 'Danske Bank A/S',                                       jurisdiction: 'DK', category: 'bank' },
  { name: 'SEB AB',                                                jurisdiction: 'SE', category: 'bank' },
  { name: 'Banco Santander Luxembourg',                           jurisdiction: 'LU', category: 'bank' },
  { name: 'Unicredit Luxembourg S.A.',                            jurisdiction: 'LU', category: 'bank' },
  { name: 'Intesa Sanpaolo Bank Luxembourg',                      jurisdiction: 'LU', category: 'bank' },
  { name: 'Mediobanca International (Luxembourg) S.A.',           jurisdiction: 'LU', category: 'bank' },
  { name: 'Raiffeisen Bank International AG',                     jurisdiction: 'AT', category: 'bank' },
  { name: 'Erste Group Bank AG',                                   jurisdiction: 'AT', category: 'bank' },
  { name: 'Bank of New York Mellon S.A./N.V. Luxembourg',         jurisdiction: 'LU', category: 'bank' },
  { name: 'State Street Bank Luxembourg S.C.A.',                  jurisdiction: 'LU', category: 'bank' },

  // ─── INSURANCE (10) ───────────────────────────────────────────────
  { name: 'Allianz SE',                                            jurisdiction: 'DE', category: 'insurance' },
  { name: 'AXA S.A.',                                              jurisdiction: 'FR', category: 'insurance' },
  { name: 'Munich Re',                                             jurisdiction: 'DE', category: 'insurance' },
  { name: 'Swiss Re Europe S.A.',                                  jurisdiction: 'LU', category: 'insurance' },
  { name: 'Generali Insurance Asset Management',                  jurisdiction: 'IT', category: 'insurance' },
  { name: 'Zurich Insurance plc',                                   jurisdiction: 'IE', category: 'insurance' },
  { name: 'NN Group N.V.',                                          jurisdiction: 'NL', category: 'insurance' },
  { name: 'Aviva Investors Luxembourg',                           jurisdiction: 'LU', category: 'insurance' },
  { name: 'Talanx International AG',                              jurisdiction: 'DE', category: 'insurance' },
  { name: 'Athora Holding Ltd.',                                   jurisdiction: 'BM', category: 'insurance' },

  // ─── PRIVATE EQUITY & ALTERNATIVES (15) ───────────────────────────
  { name: 'CVC Capital Partners SICAV-FIS S.A.',                  jurisdiction: 'LU', category: 'private_equity' },
  { name: 'EQT Partners (Luxembourg) S.à r.l.',                   jurisdiction: 'LU', category: 'private_equity' },
  { name: 'KKR Luxembourg Management S.à r.l.',                   jurisdiction: 'LU', category: 'private_equity' },
  { name: 'Blackstone Group International Partners (Lux)',         jurisdiction: 'LU', category: 'private_equity' },
  { name: 'Carlyle Investment Management Luxembourg',             jurisdiction: 'LU', category: 'private_equity' },
  { name: 'Bridgepoint Advisers Limited',                          jurisdiction: 'GB', category: 'private_equity' },
  { name: 'Cinven Luxembourg S.à r.l.',                           jurisdiction: 'LU', category: 'private_equity' },
  { name: 'PAI Partners SAS',                                      jurisdiction: 'FR', category: 'private_equity' },
  { name: 'Triton Investment Management Luxembourg',               jurisdiction: 'LU', category: 'private_equity' },
  { name: 'IK Investment Partners',                                 jurisdiction: 'LU', category: 'private_equity' },
  { name: 'Apollo Management International LLP (London)',          jurisdiction: 'GB', category: 'private_equity' },
  { name: 'Ardian Investment Switzerland',                         jurisdiction: 'CH', category: 'private_equity' },
  { name: 'Antin Infrastructure Partners',                          jurisdiction: 'FR', category: 'private_equity' },
  { name: 'Vauban Infrastructure Partners',                         jurisdiction: 'FR', category: 'private_equity' },
  { name: 'Meridiam SAS',                                          jurisdiction: 'FR', category: 'private_equity' },

  // ─── REAL ESTATE & INFRASTRUCTURE (8) ─────────────────────────────
  { name: 'PATRIZIA Real Estate Investment Management Luxembourg', jurisdiction: 'LU', category: 'real_estate' },
  { name: 'Hines European Real Estate Partners (Lux)',             jurisdiction: 'LU', category: 'real_estate' },
  { name: 'CBRE Investment Management (Luxembourg) S.A.',          jurisdiction: 'LU', category: 'real_estate' },
  { name: 'AXA Investment Managers - Real Assets',                  jurisdiction: 'FR', category: 'real_estate' },
  { name: 'Prologis European Logistics Fund',                       jurisdiction: 'LU', category: 'real_estate' },
  { name: 'Schroder Real Estate Investment Management (Lux)',      jurisdiction: 'LU', category: 'real_estate' },
  { name: 'Macquarie Infrastructure (Lux) S.à r.l.',               jurisdiction: 'LU', category: 'real_estate' },
  { name: 'Aberdeen European Property Fund (Lux)',                  jurisdiction: 'LU', category: 'real_estate' },

  // ─── WEALTH & PRIVATE BANKING (7) ─────────────────────────────────
  { name: 'Pictet & Cie (Europe) S.A.',                             lei: '222100FT5B9H8W7QAQ64', jurisdiction: 'LU', category: 'wealth' },
  { name: 'Lombard Odier (Europe) S.A.',                           jurisdiction: 'LU', category: 'wealth' },
  { name: 'Union Bancaire Privée (Europe) S.A.',                   jurisdiction: 'LU', category: 'wealth' },
  { name: 'Bordier & Cie (Switzerland) Luxembourg branch',          jurisdiction: 'LU', category: 'wealth' },
  { name: 'JOH. BERENBERG, GOSSLER & CO. KG',                       jurisdiction: 'DE', category: 'wealth' },
  { name: 'Hauck Aufhäuser Lampe Privatbank AG',                    jurisdiction: 'DE', category: 'wealth' },
  { name: 'M.M.Warburg & CO',                                        jurisdiction: 'DE', category: 'wealth' },
]

export const BOOK_VERSION = 'GENESIS-BOOK-I'  // semantic versioning at the Book level

export interface BookEntry {
  rank: number
  candidate: BookCandidate
  pre_crime_index: number
  genesis_score: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  pattern_match?: string
  forecast: string
  merkle_root: string
  signature: string
  prophecy_id: string
}

export interface BookManifest {
  version: string
  sealed_at: string
  reveal_at: string
  total_prophecies: number
  vindications: number
  misses: number
  pending: number
  merkle_root: string  // root over all 100 entries
  ots_receipt?: string  // base64 OpenTimestamps proof
  ots_calendar?: string
  ots_submitted_at?: string
  ots_status: 'PENDING_ANCHOR' | 'CALENDAR_ATTESTED' | 'BITCOIN_CONFIRMED'
}
