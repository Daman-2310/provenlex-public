import Link from 'next/link'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)', color: 'white' }}>
      <div className="max-w-xl w-full text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
          style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
          <Compass className="w-3.5 h-3.5 text-[#9b6dff]" />
          <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">404 · No such page</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-4 leading-tight">
          That prophecy<br />wasn&apos;t written.
        </h1>
        <p className="text-[rgba(255,255,255,0.65)] text-base leading-relaxed mb-7">
          The URL you reached does not exist in the Book of Genesis. It may have been moved,
          deleted, or never sealed in the first place.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 max-w-md mx-auto">
          <NavTile href="/" label="Home" />
          <NavTile href="/watchlist" label="Watch List" />
          <NavTile href="/book" label="The Book" />
          <NavTile href="/obituary" label="Obituaries" />
          <NavTile href="/deck" label="Pitch Deck" />
          <NavTile href="/research" label="Foresight Lab" />
        </div>

        <p className="text-[11px] text-[rgba(255,255,255,0.4)]">
          Looking for something specific? Try Cmd+K to search the full site.
        </p>
      </div>
    </div>
  )
}

function NavTile({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}
      className="block rounded-lg px-3 py-2 text-[11px] uppercase tracking-wider font-bold transition-all"
      style={{ background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.2)', color: '#9b6dff' }}>
      {label}
    </Link>
  )
}
