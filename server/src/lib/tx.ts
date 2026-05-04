import type { PrismaClient } from '@prisma/client';
import type { Tx } from './db';

/**
 * Cross-runtime transaction helper.
 *
 *  - Local SQLite (and any non-D1 adapter): runs the callback inside
 *    `prisma.$transaction(async tx => ...)` for full atomicity. Tests rely
 *    on this to assert all-or-nothing semantics.
 *  - Cloudflare D1 (`@prisma/adapter-d1`): callback-form $transaction is
 *    not supported. We invoke the callback with the bare `prisma` client,
 *    so writes happen sequentially WITHOUT atomicity. Acceptable for the
 *    current demo / small-team use; a real high-traffic deployment should
 *    refactor to either batch-form `$transaction([...])` or sagas.
 */
export async function runInTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: PrismaClient | Tx) => Promise<T>,
): Promise<T> {
  const adapter = (prisma as unknown as { _engineConfig?: { adapter?: { adapterName?: string } } })
    ._engineConfig?.adapter;
  if (adapter?.adapterName === '@prisma/adapter-d1') {
    return fn(prisma);
  }
  return prisma.$transaction(fn);
}
