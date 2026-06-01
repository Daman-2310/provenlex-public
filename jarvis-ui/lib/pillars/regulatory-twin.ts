// PILLAR 6 — Neural Regulatory Twin (INSTITUTIONAL ARCHETYPE EDITION)
//
// HARD CONSTRAINT: this models the ENFORCEMENT POSTURE OF AN INSTITUTION
// (CSSF, BaFin, FCA, AMF, ...) derived from PUBLISHED enforcement patterns —
// NOT the psychographics of any identifiable individual. Modelling a named
// human's behaviour would violate GDPR Art. 9/22 and invite defamation. We do
// not do that, by design, here or anywhere in Genesis.
//
// The twin answers: "given THIS supervisor's published behaviour, how does
// enforcement risk for a given breach profile differ from the EU baseline?"
// It is a parameterised behavioural model of an institution, with documented
// inputs, that produces an enforcement-risk vector + a textual posture read.

export interface SupervisorArchetype {
  code: string
  label: string
  // Posture dials, each 0..1, sourced from published enforcement statistics
  aggression: number          // propensity to escalate to formal action
  speed: number               // how fast they move from signal to action
  transparency: number        // how publicly they telegraph (press releases)
  thematic_focus: string[]    // current published supervisory priorities
  fine_propensity: number     // 0..1 likelihood of monetary penalty vs guidance
  notes: string
}

export const ARCHETYPES: Record<string, SupervisorArchetype> = {
  CSSF: {
    code: 'CSSF', label: 'CSSF — Luxembourg',
    aggression: 0.45, speed: 0.40, transparency: 0.55, fine_propensity: 0.35,
    thematic_focus: ['AML/CFT', 'AIFMD depositary duties', 'DORA ICT resilience', 'fund liquidity'],
    notes: 'Process-oriented; favours remediation plans and circulars over headline fines. Escalates sharply on AML and depositary-segregation failures.',
  },
  BaFin: {
    code: 'BaFin', label: 'BaFin — Germany',
    aggression: 0.70, speed: 0.55, transparency: 0.65, fine_propensity: 0.60,
    thematic_focus: ['post-Wirecard governance', 'special audits (§44 KWG)', 'short-selling integrity', 'crypto custody'],
    notes: 'Post-Wirecard reform raised aggression markedly; now quick to commission special audits and publish. High weight on governance + auditor-relationship signals.',
  },
  FCA: {
    code: 'FCA', label: 'FCA — United Kingdom',
    aggression: 0.72, speed: 0.60, transparency: 0.80, fine_propensity: 0.68,
    thematic_focus: ['Consumer Duty', 'operational resilience', 'market abuse', 'crypto promotions', 'AppFin fraud'],
    notes: 'High transparency (Dear-CEO letters, public censure). Strong fine propensity and fast on consumer-harm and market-abuse themes.',
  },
  AMF: {
    code: 'AMF', label: 'AMF/ACPR — France',
    aggression: 0.55, speed: 0.50, transparency: 0.60, fine_propensity: 0.50,
    thematic_focus: ['SFDR greenwashing', 'retail product governance', 'market integrity'],
    notes: 'Balanced posture; rising focus on sustainability-disclosure (greenwashing) enforcement.',
  },
  AFM: {
    code: 'AFM', label: 'AFM/DNB — Netherlands',
    aggression: 0.58, speed: 0.52, transparency: 0.62, fine_propensity: 0.52,
    thematic_focus: ['transaction reporting', 'AML', 'fund cost transparency'],
    notes: 'Data-driven supervision; strong on transaction-reporting quality and AML.',
  },
}

export interface BreachProfile {
  theme: string               // e.g. 'AML', 'governance', 'liquidity', 'SFDR'
  severity: number            // 0..1
  public_signal: number       // 0..1 — how visible the breach already is in press
}

export interface TwinRead {
  supervisor: string
  enforcement_risk: number       // 0..100
  expected_speed_months: number
  likely_instrument: 'circular_guidance' | 'special_audit' | 'public_censure' | 'monetary_fine' | 'licence_action'
  thematic_alignment: number     // 0..1 — does the breach hit a current priority?
  posture_read: string
}

export function readTwin(code: string, breach: BreachProfile): TwinRead {
  const a = ARCHETYPES[code] ?? ARCHETYPES.CSSF
  const aligned = a.thematic_focus.some(t => t.toLowerCase().includes(breach.theme.toLowerCase()) || breach.theme.toLowerCase().includes(t.toLowerCase().split(/[ /]/)[0]))
  const thematic_alignment = aligned ? 1 : 0.3

  // Risk = weighted blend of aggression, severity, public signal, thematic alignment
  const risk = Math.round(100 * (
    0.30 * a.aggression +
    0.30 * breach.severity +
    0.20 * breach.public_signal +
    0.20 * thematic_alignment
  ) * (aligned ? 1.15 : 0.9))

  const expected_speed_months = Math.round((1 - a.speed) * 18 + (1 - breach.severity) * 6 + 2)

  let likely_instrument: TwinRead['likely_instrument']
  if (risk >= 80 && a.fine_propensity > 0.6) likely_instrument = 'licence_action'
  else if (risk >= 65 && a.fine_propensity > 0.5) likely_instrument = 'monetary_fine'
  else if (risk >= 55 && a.transparency > 0.6) likely_instrument = 'public_censure'
  else if (breach.theme.toLowerCase().includes('aml') || a.code === 'BaFin') likely_instrument = 'special_audit'
  else likely_instrument = 'circular_guidance'

  const posture_read = `${a.label}: ${a.notes} For a ${breach.theme} breach at severity ${(breach.severity * 100).toFixed(0)}%${aligned ? ' (on a current supervisory priority)' : ''}, expect ${likely_instrument.replace('_', ' ')} within ~${expected_speed_months} months. Enforcement-risk index ${Math.min(100, risk)}/100.`

  return {
    supervisor: a.label,
    enforcement_risk: Math.min(100, risk),
    expected_speed_months,
    likely_instrument,
    thematic_alignment,
    posture_read,
  }
}
