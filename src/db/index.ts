import 'server-only'
import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { env } from '@/env'
import * as schema from './schema'

let instance: NeonHttpDatabase<typeof schema> | undefined

export function db() {
  instance ??= drizzle(neon(env().DATABASE_URL), { schema })
  return instance
}

export { schema }
export type { ComponentType } from './schema'
