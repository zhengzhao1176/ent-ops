import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

// ============================================================
// Dual-mode Prisma factory
// ============================================================
// Local dev / tests:  lazy module-level singleton over SQLite (DATABASE_URL).
// Cloudflare Workers: per-request PrismaClient bound to env.DB (D1) via
//                     the @prisma/adapter-d1 driver adapter.
//
// The Node singleton is constructed LAZILY (via Proxy) so that route
// modules can be statically evaluated in the Next.js Edge runtime build
// step without triggering `new PrismaClient()` (which throws in Edge).
// HTTP context creators that hit D1 instead never trip the proxy.
// ============================================================

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function getNodeSingleton(): PrismaClient {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;
  const c = new PrismaClient({
    log: process.env.NODE_ENV === 'test' ? [] : ['warn', 'error'],
  });
  if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = c;
  return c;
}

/**
 * Lazy proxy. Accessing any property triggers singleton construction.
 * Module import alone does NOT — safe to import from edge-bundled routes.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const target = getNodeSingleton() as unknown as Record<string | symbol, unknown>;
    const v = target[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
  },
}) as PrismaClient;

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Returns a PrismaClient appropriate for the current request environment.
 *
 *  - If a D1 binding is provided (Cloudflare Workers), constructs a fresh
 *    client wrapping it via the driver adapter.
 *  - Otherwise returns the lazily-initialized Node singleton over the
 *    local DATABASE_URL.
 */
export function getPrismaForEnv(d1?: D1Database): PrismaClient {
  if (d1) {
    return new PrismaClient({ adapter: new PrismaD1(d1) });
  }
  return getNodeSingleton();
}
