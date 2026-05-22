'use client'
export function Dot({ color = '#10b981', pulse = false, size = 8 }) {
  return (
    <span
      className={pulse ? 'pulse-dot inline-block rounded-full' : 'inline-block rounded-full'}
      style={{ background: color, color, width: size, height: size, flexShrink: 0 }}
    />
  )
}
