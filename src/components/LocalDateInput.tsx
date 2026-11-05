'use client'
import { useState } from 'react'

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toLocalMidnightIso(v: string) {
  const [y, m, d] = v.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d).toISOString() : ''
}

/**
 * Datumkiezer die het begin van de dag in de tijdzone van de gebruiker doorgeeft
 * (veld `at`, ISO). Zo telt een rit later op die dag in de nieuwe cyclus.
 */
export function LocalDateInput({ label, defaultToday = true }: { label: string; defaultToday?: boolean }) {
  const max = todayLocal()
  const [value, setValue] = useState(defaultToday ? max : '')
  return (
    <label>
      {label}
      <input type="date" required max={max} value={value} onChange={(e) => setValue(e.target.value)} />
      <input type="hidden" name="at" value={value ? toLocalMidnightIso(value) : ''} />
    </label>
  )
}
