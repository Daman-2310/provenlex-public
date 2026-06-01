'use client'

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Terminal,
  Shield,
  Activity,
  AlertTriangle,
  Zap,
  GitBranch,
  BarChart2,
  Eye,
  Lock,
  Radio,
  FileDown,
  RefreshCw,
  X,
  Command,
  Cpu,
  Globe,
  Bug,
  ChevronRight,
} from 'lucide-react'

export type CommandCategory =
  | 'navigate'
  | 'action'
  | 'system'
  | 'query'

export interface CommandDefinition {
  id: string
  label: string
  description: string
  category: CommandCategory
  icon: React.ElementType
  shortcut?: string
  keywords: string[]
  execute: () => void | Promise<void>
}

export interface CommandBarProps {
  onOpen?: () => void
  onClose?: () => void
  extraCommands?: CommandDefinition[]
}

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigate: 'Navigation',
  action: 'Actions',
  system: 'System',
  query: 'Query',
}

const CATEGORY_COLORS: Record<CommandCategory, string> = {
  navigate: '#4a9eff',
  action: '#00ff88',
  system: '#ffaa00',
  query: '#a855f7',
}

function scrollToSection(id: string): void {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function buildDefaultCommands(close: () => void): CommandDefinition[] {
  return [
    {
      id: 'nav-bots',
      label: 'Bot Grid',
      description: 'Jump to live anomaly scores panel',
      category: 'navigate',
      icon: Cpu,
      keywords: ['bot', 'grid', 'anomaly', 'detection', 'score'],
      execute: () => { scrollToSection('bot-grid'); close() },
    },
    {
      id: 'nav-consensus',
      label: 'Consensus Ring',
      description: 'Jump to PBFT consensus visualizer',
      category: 'navigate',
      icon: Radio,
      keywords: ['consensus', 'pbft', 'ring', 'quorum', 'bft'],
      execute: () => { scrollToSection('consensus-ring'); close() },
    },
    {
      id: 'nav-threat',
      label: 'Threat Map',
      description: 'Jump to geographic threat distribution',
      category: 'navigate',
      icon: Globe,
      keywords: ['threat', 'map', 'geo', 'geographic', 'risk'],
      execute: () => { scrollToSection('threat-map'); close() },
    },
    {
      id: 'nav-merkle',
      label: 'Merkle Ledger',
      description: 'Jump to immutable audit chain viewer',
      category: 'navigate',
      icon: GitBranch,
      keywords: ['merkle', 'ledger', 'audit', 'chain', 'hash'],
      execute: () => { scrollToSection('merkle-ledger'); close() },
    },
    {
      id: 'nav-gateway',
      label: 'Transaction Gateway',
      description: 'Jump to pre-execution quorum panel',
      category: 'navigate',
      icon: Shield,
      keywords: ['gateway', 'transaction', 'quorum', 'block', 'approve'],
      execute: () => { scrollToSection('tx-gateway'); close() },
    },
    {
      id: 'nav-cases',
      label: 'Case Management',
      description: 'Jump to compliance investigation workflow',
      category: 'navigate',
      icon: Eye,
      keywords: ['case', 'compliance', 'investigation', 'workflow'],
      execute: () => { scrollToSection('case-management'); close() },
    },
    {
      id: 'nav-regulatory',
      label: 'Regulatory Parser',
      description: 'Jump to semantic rule weighting engine',
      category: 'navigate',
      icon: Lock,
      keywords: ['regulatory', 'rule', 'parser', 'compliance', 'cssf', 'dora'],
      execute: () => { scrollToSection('regulatory-panel'); close() },
    },
    {
      id: 'nav-sanctions',
      label: 'OFAC Screening',
      description: 'Jump to SDN live sanctions panel',
      category: 'navigate',
      icon: AlertTriangle,
      keywords: ['ofac', 'sanctions', 'sdn', 'screening', 'us treasury'],
      execute: () => { scrollToSection('sanctions-panel'); close() },
    },
    {
      id: 'action-anomaly',
      label: 'Trigger Demo Anomaly',
      description: 'Force a high-score anomaly event across the swarm',
      category: 'action',
      icon: Zap,
      shortcut: '⌘⇧A',
      keywords: ['demo', 'anomaly', 'trigger', 'force', 'test'],
      execute: async () => {
        const { triggerDemoAnomaly } = await import('@/lib/api')
        await triggerDemoAnomaly()
        close()
      },
    },
    {
      id: 'action-reset',
      label: 'Reset Demo State',
      description: 'Clear all injected anomalies and restore baseline',
      category: 'action',
      icon: RefreshCw,
      keywords: ['reset', 'demo', 'clear', 'restore', 'baseline'],
      execute: async () => {
        const { resetDemo } = await import('@/lib/api')
        await resetDemo()
        close()
      },
    },
    {
      id: 'action-export',
      label: 'Export DORA Report',
      description: 'Download PDF compliance report for regulators',
      category: 'action',
      icon: FileDown,
      shortcut: '⌘⇧E',
      keywords: ['export', 'dora', 'pdf', 'report', 'compliance', 'download'],
      execute: () => {
        const base = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8000'
        window.open(`${base}/api/report/compliance`, '_blank')
        close()
      },
    },
    {
      id: 'action-boardroom',
      label: 'Launch Boardroom Mode',
      description: 'Start guided investor demo sequence',
      category: 'action',
      icon: BarChart2,
      keywords: ['boardroom', 'investor', 'demo', 'presentation', 'guided'],
      execute: async () => {
        const { startBoardroomMode } = await import('@/lib/api')
        await startBoardroomMode()
        close()
      },
    },
    {
      id: 'system-chaos',
      label: 'Inject Chaos Attack',
      description: 'Simulate Byzantine fault for resilience testing',
      category: 'system',
      icon: Bug,
      keywords: ['chaos', 'byzantine', 'fault', 'inject', 'resilience', 'test'],
      execute: async () => {
        const { injectChaos } = await import('@/lib/api')
        await injectChaos('BYZANTINE_FAULT')
        close()
      },
    },
    {
      id: 'system-metrics',
      label: 'System Metrics',
      description: 'Jump to system performance overview',
      category: 'system',
      icon: Activity,
      keywords: ['metrics', 'system', 'performance', 'cpu', 'memory'],
      execute: () => { scrollToSection('system-metrics'); close() },
    },
    {
      id: 'query-memory',
      label: 'Query AI Memory',
      description: 'Search the swarm vector memory store',
      category: 'query',
      icon: Terminal,
      shortcut: '⌘⇧Q',
      keywords: ['query', 'memory', 'ai', 'vector', 'search', 'xai'],
      execute: () => { scrollToSection('xai-card'); close() },
    },
  ]
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[rgba(0,255,136,0.25)] text-[#00ff88] rounded-sm px-px">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}

const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 520, damping: 36, mass: 0.6 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -8,
    transition: { duration: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -6 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.025, duration: 0.14 },
  }),
}

export function CommandBar({ onOpen, onClose, extraCommands = [] }: CommandBarProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [executing, setExecuting] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIdx(0)
    onClose?.()
  }, [onClose])

  const commands = buildDefaultCommands(close).concat(extraCommands)

  const filtered = query.trim()
    ? commands.filter(cmd => {
        const q = query.toLowerCase()
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q) ||
          cmd.keywords.some(k => k.includes(q))
        )
      })
    : commands

  const grouped = filtered.reduce<Record<CommandCategory, CommandDefinition[]>>(
    (acc, cmd) => {
      acc[cmd.category].push(cmd)
      return acc
    },
    { navigate: [], action: [], system: [], query: [] },
  )

  const flatFiltered = Object.values(grouped).flat()

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) {
          close()
        } else {
          setOpen(true)
          onOpen?.()
        }
      }
      if (e.key === 'Escape' && open) {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, onOpen])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const execute = useCallback(
    async (cmd: CommandDefinition) => {
      setExecuting(cmd.id)
      try {
        await cmd.execute()
      } finally {
        setExecuting(null)
      }
    },
    [],
  )

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, flatFiltered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = flatFiltered[activeIdx]
      if (cmd) void execute(cmd)
    }
  }

  let flatIdx = 0

  return (
    <>
      <button
        onClick={() => { setOpen(true); onOpen?.() }}
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded border
          border-[rgba(0,255,136,0.2)] bg-[rgba(0,255,136,0.03)]
          text-[rgba(0,255,136,0.5)] text-[10px] uppercase tracking-wider
          hover:border-[rgba(0,255,136,0.4)] hover:text-[#00ff88] transition-colors"
        aria-label="Open command bar"
      >
        <Command className="w-3 h-3" />
        <span>Command</span>
        <span className="ml-1 px-1 py-0.5 bg-[rgba(0,255,136,0.1)] rounded text-[9px] leading-none">
          ⌘K
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh]"
            style={{ background: 'rgba(5,5,8,0.82)', backdropFilter: 'blur(6px)' }}
            onClick={close}
          >
            <motion.div
              key="panel"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={e => e.stopPropagation()}
              className="w-full max-w-xl mx-4 rounded-lg overflow-hidden"
              style={{
                background: '#0a0a12',
                border: '1px solid rgba(0,255,136,0.25)',
                boxShadow: '0 0 0 1px rgba(0,255,136,0.08), 0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(0,255,136,0.06)',
              }}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(0,255,136,0.12)]">
                <Search className="w-4 h-4 text-[rgba(0,255,136,0.5)] shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search commands…"
                  className="flex-1 bg-transparent text-[#00ff88] text-sm font-mono
                    placeholder:text-[rgba(0,255,136,0.3)] outline-none caret-[#00ff88]"
                  aria-label="Command search"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={close}
                  className="text-[rgba(0,255,136,0.3)] hover:text-[#00ff88] transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ul
                ref={listRef}
                className="max-h-[420px] overflow-y-auto py-2"
                role="listbox"
                aria-label="Commands"
              >
                {flatFiltered.length === 0 && (
                  <li className="px-4 py-6 text-center text-[rgba(0,255,136,0.3)] text-xs font-mono uppercase tracking-wider">
                    No commands match &ldquo;{query}&rdquo;
                  </li>
                )}
                {(Object.entries(grouped) as Array<[CommandCategory, CommandDefinition[]]>).map(
                  ([category, cmds]) => {
                    if (cmds.length === 0) return null
                    return (
                      <li key={category} role="presentation">
                        <div className="px-4 pt-3 pb-1 text-[9px] uppercase tracking-[0.12em] font-bold"
                          style={{ color: CATEGORY_COLORS[category] }}
                        >
                          {CATEGORY_LABELS[category]}
                        </div>
                        <ul role="group">
                          {cmds.map(cmd => {
                            const idx = flatIdx++
                            const isActive = idx === activeIdx
                            const isRunning = executing === cmd.id
                            const IconComponent = cmd.icon
                            return (
                              <motion.li
                                key={cmd.id}
                                custom={idx}
                                variants={itemVariants}
                                initial="hidden"
                                animate="visible"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => void execute(cmd)}
                                onMouseEnter={() => setActiveIdx(idx)}
                                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors"
                                style={{
                                  background: isActive
                                    ? 'rgba(0,255,136,0.07)'
                                    : 'transparent',
                                  borderLeft: isActive
                                    ? `2px solid ${CATEGORY_COLORS[category]}`
                                    : '2px solid transparent',
                                }}
                              >
                                <IconComponent
                                  className="w-4 h-4 shrink-0"
                                  style={{ color: isActive ? CATEGORY_COLORS[category] : 'rgba(0,255,136,0.4)' }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-mono text-[#00ff88] truncate">
                                    {highlight(cmd.label, query)}
                                  </div>
                                  <div className="text-[10px] text-[rgba(0,255,136,0.4)] truncate">
                                    {highlight(cmd.description, query)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {cmd.shortcut && (
                                    <span className="text-[9px] text-[rgba(0,255,136,0.35)] font-mono">
                                      {cmd.shortcut}
                                    </span>
                                  )}
                                  {isRunning ? (
                                    <span className="w-3.5 h-3.5 border border-[#00ff88] border-t-transparent rounded-full animate-spin" />
                                  ) : isActive ? (
                                    <ChevronRight className="w-3 h-3 text-[rgba(0,255,136,0.4)]" />
                                  ) : null}
                                </div>
                              </motion.li>
                            )
                          })}
                        </ul>
                      </li>
                    )
                  },
                )}
              </ul>

              <div className="px-4 py-2 border-t border-[rgba(0,255,136,0.08)] flex items-center gap-4
                text-[9px] text-[rgba(0,255,136,0.3)] font-mono uppercase tracking-wider">
                <span><kbd className="px-1 py-0.5 bg-[rgba(0,255,136,0.08)] rounded text-[8px]">↑↓</kbd> Navigate</span>
                <span><kbd className="px-1 py-0.5 bg-[rgba(0,255,136,0.08)] rounded text-[8px]">↵</kbd> Execute</span>
                <span><kbd className="px-1 py-0.5 bg-[rgba(0,255,136,0.08)] rounded text-[8px]">Esc</kbd> Close</span>
                <span className="ml-auto">{flatFiltered.length} command{flatFiltered.length !== 1 ? 's' : ''}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
