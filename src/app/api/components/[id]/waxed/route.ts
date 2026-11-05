import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isSameOrigin } from '@/lib/request'
import { getSessionAthleteId } from '@/lib/session'
import { recordWaxed } from '@/server/wax'

export const runtime = 'nodejs'

/** Aangeroepen door de service worker bij de notificatie-actie "Gewaxt ✓". */
export async function POST(req: Request, ctx: RouteContext<'/api/components/[id]/waxed'>) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const athleteId = await getSessionAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'ongeldig' }, { status: 400 })
  const ok = await recordWaxed(athleteId, id, new Date(), 'push')
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'niet gevonden' }, { status: 404 })
}
