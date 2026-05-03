import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { systemClock, type Clock } from '@/lib/clock';

export interface AuthUser {
  id: bigint;
  username: string;
  realName: string;
  status: string;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
  permissions: Set<string>;
}

export interface AppContext {
  prisma: PrismaClient;
  clock: Clock;
  user?: AuthUser;
  ip?: string;
  userAgent?: string;
}

export interface CreateContextInput {
  user?: AuthUser;
  ip?: string;
  userAgent?: string;
  prisma?: PrismaClient;
  clock?: Clock;
}

export function createContext(input: CreateContextInput = {}): AppContext {
  return {
    prisma: input.prisma ?? prisma,
    clock: input.clock ?? systemClock,
    user: input.user,
    ip: input.ip,
    userAgent: input.userAgent,
  };
}
