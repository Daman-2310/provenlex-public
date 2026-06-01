import Link from 'next/link'
import { ArrowLeft, Cpu, Code2, Coins, Sparkles, Network, Hash } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import OracleConsole from './OracleConsole'

export const metadata = {
  title: 'Genesis Oracle · On-Chain Pre-Crime Index · Genesis Swarm',
  description: 'Signed Genesis scores as a public oracle. Chainlink-compatible. DeFi lending, on-chain insurance, RWA tokenization can read counterparty risk natively.',
}

const SOLIDITY_SAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Example: a DeFi lending protocol that adjusts LTV based on
// the counterparty's Genesis Pre-Crime Index.

interface IGenesisOracle {
  function getScore(bytes32 prophecyId)
    external view returns (uint8 pci, uint256 sealedAt, bytes memory sig);
}

contract GenesisAwareVault {
  IGenesisOracle public oracle;
  uint8 constant MAX_LTV_HIGH_RISK = 30;   // 30% LTV when PCI ≥ 70
  uint8 constant MAX_LTV_MED_RISK  = 50;   // 50% LTV when PCI 50-69
  uint8 constant MAX_LTV_LOW_RISK  = 75;   // 75% LTV when PCI < 50

  function maxLtvFor(bytes32 prophecyId) public view returns (uint8) {
    (uint8 pci, , ) = oracle.getScore(prophecyId);
    if (pci >= 70) return MAX_LTV_HIGH_RISK;
    if (pci >= 50) return MAX_LTV_MED_RISK;
    return MAX_LTV_LOW_RISK;
  }
}`

const CHAINLINK_FN = `// Chainlink Functions — fetches a Genesis score and returns it on-chain.
const apiResponse = await Functions.makeHttpRequest({
  url: \`https://genesis-swarm-rgq5.vercel.app/api/oracle?entity=\${args[0]}\`,
})
if (apiResponse.error) throw Error('Genesis oracle unreachable')
const { pre_crime_index, signature, prophecy_id } = apiResponse.data
return Functions.encodeUint256(BigInt(pre_crime_index))`

const TOOLS = [
  { icon: Network,  title: 'DeFi lending',     desc: 'Adjust loan-to-value ratios based on borrower\'s counterparty risk' },
  { icon: Coins,    title: 'RWA tokenization', desc: 'Tokenized fund shares carry their Genesis score as an on-chain attribute' },
  { icon: Hash,     title: 'On-chain insurance', desc: 'Smart-contract underwriters price premiums against Pre-Crime Index' },
  { icon: Cpu,      title: 'Risk-aware AMMs',  desc: 'Liquidity pools rebalance away from elevated-risk asset baskets' },
]

export default function OraclePage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#00d8ff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Cpu className="w-4 h-4 text-[#00d8ff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00d8ff]">GENESIS ORACLE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            HTTP · Chainlink-compatible · Public, no API key
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,216,255,0.08)', border: '1px solid rgba(0,216,255,0.3)' }}>
            <Sparkles className="w-3 h-3 text-[#00d8ff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00d8ff]">
              S&P Ratings for the on-chain financial system
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Genesis scores,</span>{' '}
            <span style={{
              background: 'linear-gradient(90deg, #00d8ff 0%, #9b6dff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,216,255,0.3))',
            }}>readable by any smart contract.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Every Book entity exposes a signed, machine-readable Pre-Crime Index over plain HTTP.
            DeFi lending, RWA tokenization, on-chain insurance can read counterparty risk natively.
            S&P, Moody&apos;s, Fitch cannot ship to crypto. We can.
          </p>
        </div>

        {/* LIVE CONSOLE */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">1. Try it live</div>
          <OracleConsole />
        </section>

        {/* WHAT YOU GET */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">2. What the oracle returns</div>
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
            <div className="flex items-center gap-2 px-4 py-2"
              style={{ background: 'rgba(0,216,255,0.06)', borderBottom: '1px solid rgba(0,216,255,0.15)' }}>
              <Code2 className="w-3.5 h-3.5 text-[#00d8ff]" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#00d8ff]">JSON Response</span>
            </div>
            <pre className="p-4 text-[11px] font-mono text-[rgba(255,255,255,0.88)] overflow-x-auto leading-relaxed">{`{
  "version": "GENESIS-ORACLE-V1",
  "entity": "Deutsche Bank AG, London Branch",
  "prophecy_id": "578a618e28db",
  "jurisdiction": "GB",
  "category": "bank",
  "pre_crime_index": 55,
  "genesis_score": 45,
  "trajectory": "RISING",
  "pattern_match": "wirecard",
  "merkle_root": "578a618e28db37195e901643aae77a243ec86d43258a02a77431ee9185db812c",
  "book_merkle_root": "dd3a448c450942ee...",
  "sealed_at": "2026-05-30T04:55:51.311Z",
  "served_at": "2026-05-30T15:32:00.000Z",
  "signature_alg": "HMAC-SHA256",
  "signature": "a3f2..."
}`}</pre>
          </div>
        </section>

        {/* SOLIDITY SAMPLE */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">3. Sample Solidity consumer</div>
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
            <div className="flex items-center gap-2 px-4 py-2"
              style={{ background: 'rgba(0,216,255,0.06)', borderBottom: '1px solid rgba(0,216,255,0.15)' }}>
              <Code2 className="w-3.5 h-3.5 text-[#00d8ff]" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#00d8ff]">Solidity ^0.8.20</span>
            </div>
            <pre className="p-4 text-[11px] font-mono text-[rgba(255,255,255,0.88)] overflow-x-auto leading-relaxed">{SOLIDITY_SAMPLE}</pre>
          </div>
        </section>

        {/* CHAINLINK */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">4. Chainlink Functions adapter</div>
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(155,109,255,0.25)', backdropFilter: 'blur(10px)' }}>
            <div className="flex items-center gap-2 px-4 py-2"
              style={{ background: 'rgba(155,109,255,0.06)', borderBottom: '1px solid rgba(155,109,255,0.15)' }}>
              <Code2 className="w-3.5 h-3.5 text-[#9b6dff]" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#9b6dff]">JavaScript (Chainlink DON)</span>
            </div>
            <pre className="p-4 text-[11px] font-mono text-[rgba(255,255,255,0.88)] overflow-x-auto leading-relaxed">{CHAINLINK_FN}</pre>
          </div>
        </section>

        {/* USE CASES */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">5. Who reads this</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TOOLS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl p-4"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,216,255,0.2)', backdropFilter: 'blur(10px)' }}>
                <Icon className="w-4 h-4 text-[#00d8ff] mb-2" />
                <div className="text-[12px] font-bold text-white mb-1">{title}</div>
                <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* MOAT */}
        <section className="rounded-2xl p-6"
          style={{ background: 'rgba(0,216,255,0.04)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <Cpu className="w-5 h-5 text-[#00d8ff] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-2">Why crypto adopts Genesis, not S&P</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            S&P, Moody&apos;s and Fitch are paid by issuers. They publish PDFs.
            They don&apos;t expose JSON endpoints. They don&apos;t sign their ratings.
            They are not <em>readable</em> by a smart contract — only quotable in prose.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            Genesis publishes signed, queryable, machine-readable risk scores under a permissive
            license. RWA tokenization is a $4T market opening up. Every protocol issuing
            tokenized bonds, lending against real-world collateral, or building DeFi on top of
            funds needs <strong className="text-white">a risk feed that S&P can&apos;t provide</strong>.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Strategically: a16z, Paradigm, Variant invest in infrastructure for tokenized finance.
            An open, permissionless risk oracle is exactly the kind of infrastructure they fund.
          </p>
        </section>

      </div>
    </div>
  )
}
