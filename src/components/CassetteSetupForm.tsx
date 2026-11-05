'use client'
import { useState } from 'react'
import { addCassette } from '@/app/actions'
import { LocalDateInput } from './LocalDateInput'

/** Montagedatum is de standaard; "km bekend" en "geen idee" als alternatief (CLAUDE.md, onboarding). */
export function CassetteSetupForm({ bikeId }: { bikeId: string }) {
  const [mode, setMode] = useState<'date' | 'km' | 'unknown'>('date')
  return (
    <form action={addCassette} className="stack">
      <input type="hidden" name="bikeId" value={bikeId} />
      <input type="hidden" name="mode" value={mode} />
      <div className="segmented" role="radiogroup" aria-label="Wat weet je van je cassette?">
        {(
          [
            ['date', 'Datum'],
            ['km', 'Km bekend'],
            ['unknown', 'Geen idee'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} className={mode === v ? 'active' : ''} onClick={() => setMode(v)}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'date' && <LocalDateInput label="Wanneer is de cassette gemonteerd?" defaultToday={false} />}
      {mode === 'km' && (
        <label>
          Hoeveel km zitten er ongeveer op?
          <input type="number" name="km" min={0} max={200000} step={100} required inputMode="numeric" />
        </label>
      )}
      {mode === 'unknown' && <p className="muted small">De teller start vandaag op 0 en wordt gelabeld als onbekende historie.</p>}
      <button type="submit" className="secondary">Cassette toevoegen</button>
    </form>
  )
}
