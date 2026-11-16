import { useEffect, useRef } from 'react'

const count = 61
const lerp = (a, b, t) => a + (b - a) * t
const mix = (a, b, t) => a.map((point, i) => [lerp(point[0], b[i][0], t), lerp(point[1], b[i][1], t)])
const path = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
function sample(points) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]))
  const total = lengths.reduce((a, b) => a + b, 0)
  return Array.from({ length: count }, (_, i) => {
    let distance = i / (count - 1) * total
    let segment = 0
    while (segment < lengths.length - 1 && distance > lengths[segment]) distance -= lengths[segment++]
    const t = distance / lengths[segment]
    return [lerp(points[segment][0], points[segment + 1][0], t), lerp(points[segment][1], points[segment + 1][1], t)]
  })
}
const arrow = sample([[100, 43], [100, 133], [68, 103], [100, 133], [132, 103]])
const check = sample([[49, 102], [86, 137], [152, 69]])
function wave(seconds) {
  return Array.from({ length: count }, (_, i) => {
    const u = i / (count - 1)
    const envelope = Math.pow(Math.max(0, 1 - Math.abs(u - .5) * 1.65), 1.2)
    return [28 + 144 * u, 100 + envelope * (Math.sin(u * Math.PI * 12 - seconds * 9) * 27 + Math.sin(u * Math.PI * 19 + seconds * 5.1) * 8 + Math.sin(seconds * 2.7 + u * 17) * 4)]
  })
}

export default function MotionLogo({ loading = false, complete = false }) {
  const line = useRef(null)
  const current = useRef(complete ? check : wave(0))
  const previousLoading = useRef(loading)
  useEffect(() => {
    const wasLoading = previousLoading.current
    previousLoading.current = loading
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (complete && (reduced || !wasLoading)) {
      current.current = check
      line.current?.setAttribute('d', path(check))
      return
    }
    if ((!loading && !complete) || reduced) return
    const from = current.current
    let frame, start
    const draw = (now) => {
      if (!start) start = now
      const seconds = (now - start) / 1000
      if (!document.hidden) {
        if (complete) {
          const progress = Math.min(seconds / .55, 1)
          const eased = progress * progress * (3 - 2 * progress)
          current.current = seconds < .55 ? mix(from, arrow, eased) : mix(arrow, check, Math.min((seconds - .55) / .45, 1))
        } else current.current = wave(seconds)
        line.current?.setAttribute('d', path(current.current))
      }
      if (!complete || seconds < 1) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [loading, complete])
  return <svg className={`logo-mark motion-logo ${loading ? 'is-loading' : ''}`} viewBox="0 0 200 200" fill="none" aria-hidden="true"><path ref={line} d={path(current.current)} stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
