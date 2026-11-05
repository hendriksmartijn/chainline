// Eenmalig: maakt (of toont) de Strava webhook-subscription. Strava staat er één per app toe.
// Gebruik: pnpm strava:subscribe          → toont bestaande subscription
//          pnpm strava:subscribe create   → maakt hem aan voor $APP_URL/api/strava/webhook
//          pnpm strava:subscribe delete <id>
const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret, STRAVA_WEBHOOK_VERIFY_TOKEN: verify, APP_URL } = process.env
const base = process.env.STRAVA_API_BASE_URL || 'https://www.strava.com/api/v3'
if (!id || !secret) throw new Error('STRAVA_CLIENT_ID en STRAVA_CLIENT_SECRET zijn nodig')
const [cmd, arg] = process.argv.slice(2)
const url = `${base}/push_subscriptions`

if (cmd === 'create') {
  if (!verify || !APP_URL) throw new Error('STRAVA_WEBHOOK_VERIFY_TOKEN en APP_URL zijn nodig')
  const res = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams({ client_id: id, client_secret: secret, callback_url: `${APP_URL}/api/strava/webhook`, verify_token: verify }),
  })
  console.log(res.status, await res.text())
  console.log('Zet het id hierboven als STRAVA_SUBSCRIPTION_ID in je env vars.')
} else if (cmd === 'delete') {
  const res = await fetch(`${url}/${arg}?${new URLSearchParams({ client_id: id, client_secret: secret })}`, { method: 'DELETE' })
  console.log(res.status, await res.text())
} else {
  const res = await fetch(`${url}?${new URLSearchParams({ client_id: id, client_secret: secret })}`)
  console.log(res.status, await res.text())
}
