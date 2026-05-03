import type { PrismaClient } from '@prisma/client';

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export type Db = PrismaClient | Tx;

export interface AuthCtx {
  user: { id: bigint; isSuperAdmin?: boolean };
}

export function paginateArgs<T extends { skip: number; take: number }>(
  page: number,
  pageSize: number,
): T {
  return { skip: (page - 1) * pageSize, take: pageSize } as T;
}
