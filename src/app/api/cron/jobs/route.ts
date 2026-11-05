import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/env'
import { processPendingJobs } from '@/server/jobs'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET`. Vangnet voor jobs die after() niet afmaakte. */
export async function GET(req: NextRequest) {
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${env().CRON_SECRET}`)
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const processed = await processPendingJobs()
  return NextResponse.json({ processed })
}
