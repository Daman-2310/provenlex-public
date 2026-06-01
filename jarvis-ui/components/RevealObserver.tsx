'use client'

import { useEffect } from 'react'

/**
 * Drives the `[data-reveal]` entrance animation defined in globals.css.
 * Mounted once; observes every reveal target and adds `is-visible` as it
 * scrolls into view (once — no re-hiding on scroll-up, which feels cheap).
 *
 * Robustness: if IntersectionObserver is unavailable, everything is revealed
 * immediately so content is never stuck invisible. A <noscript> rule in the
 * layout covers the JS-disabled case.
 */
export default function RevealObserver() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (targets.length === 0) return

    if (!('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-visible'))
      return
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          io.unobserve(entry.target)
        }
      }
    }, { threshold: 0.01, rootMargin: '0px 0px -80px 0px' })

    targets.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return null
}
