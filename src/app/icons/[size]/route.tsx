import { ImageResponse } from 'next/og'

const SIZES = [96, 180, 192, 512] as const

export function generateStaticParams() {
  return SIZES.map((s) => ({ size: String(s) }))
}

/** App-icoon: een kettingschakel. Geen Strava-merk in het icoon (brand guidelines). */
export async function GET(_req: Request, ctx: RouteContext<'/icons/[size]'>) {
  const { size: raw } = await ctx.params
  const size = SIZES.find((s) => String(s) === raw) ?? 192
  const u = size / 100
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111111' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 34 * u, height: 22 * u, borderRadius: 11 * u, border: `${6 * u}px solid #f5f5f5` }} />
          <div style={{ width: 34 * u, height: 22 * u, borderRadius: 11 * u, border: `${6 * u}px solid #3b66f0`, marginLeft: -10 * u }} />
        </div>
      </div>
    ),
    { width: size, height: size },
  )
}
