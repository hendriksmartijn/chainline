/** Voortgangsring (0–100%), gekleurd naar status. */
export function Ring({ pct, status, size = 76 }: { pct: number; status: string; size?: number }) {
  const r = 32
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <svg className="ring" viewBox="0 0 76 76" width={size} height={size} aria-hidden>
      <circle className="track" cx="38" cy="38" r={r} fill="none" strokeWidth="9" />
      <circle
        className={`fill ${status}`}
        cx="38"
        cy="38"
        r={r}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
      />
    </svg>
  )
}
