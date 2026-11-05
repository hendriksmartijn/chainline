'use client'
import { useEffect, useState } from 'react'

type State = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}
function urlBase64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      // iOS: push werkt alleen vanaf het beginscherm.
      if (isIos() && !isStandalone()) return setState('ios-install')
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported')
      if (Notification.permission === 'denied') return setState('denied')
      const reg = await navigator.serviceWorker.ready
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off')
    })().catch(() => setState('unsupported'))
  }, [])

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return setState(permission === 'denied' ? 'denied' : 'off')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
      if (!res.ok) throw new Error(String(res.status))
      setState('on')
    } catch {
      setError('Aanzetten lukte niet. Probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading' || state === 'on') {
    return state === 'on' ? (
      <div className="row muted">
        <span>Meldingen staan aan.</span>
        <button className="secondary" onClick={disable} disabled={busy}>Uitzetten</button>
      </div>
    ) : null
  }

  return (
    <div className="card">
      {state === 'ios-install' && (
        <>
          <h2>Zet Chainline op je beginscherm</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Op iPhone werken meldingen alleen vanaf het beginscherm. Tik in Safari op het deel-icoon (vierkant met pijl) en kies
            <strong> Zet op beginscherm</strong>. Open Chainline daarna vanaf je beginscherm en zet hier de meldingen aan.
          </p>
        </>
      )}
      {state === 'unsupported' && <p className="muted">Deze browser ondersteunt geen pushmeldingen.</p>}
      {state === 'denied' && <p className="muted">Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je browser of telefoon.</p>}
      {state === 'off' && (
        <>
          <h2>Meldingen</h2>
          <p className="muted" style={{ marginTop: 6 }}>Alleen als er iets moet gebeuren: tijd om te waxen of een natte rit.</p>
          <button onClick={enable} disabled={busy}>Meldingen aanzetten</button>
        </>
      )}
      {error && <p className="muted" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  )
}
