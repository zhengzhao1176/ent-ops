import { appRouter } from '@server/routers/_app';
import { createContext } from '@server/context';
import type { AuthUser } from '@server/context';
import { getPrisma } from './db';

export async function buildAuthUser(userId: bigint, opts?: { skipMustChange?: boolean }): Promise<AuthUser> {
  const p = getPrisma();
  const u = await p.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  const roleCodes = u.roles.map((r) => r.role.code);
  const permissions = new Set<string>();
  u.roles.forEach((r) => r.role.permissions.forEach((rp) => permissions.add(rp.permission.code)));
  return {
    id: u.id,
    username: u.username,
    realName: u.realName,
    status: u.status,
    mustChangePassword: opts?.skipMustChange ? false : u.mustChangePassword,
    isSuperAdmin: roleCodes.includes('ROLE_SUPER_ADMIN'),
    permissions,
  };
}

export function callerFor(user?: AuthUser, ip = '127.0.0.1') {
  return appRouter.createCaller(createContext({ user, ip, prisma: getPrisma() }));
}

export async function callerForUserId(userId: bigint) {
  const u = await buildAuthUser(userId);
  return callerFor(u);
}

export const anonymousCaller = () => callerFor(undefined);
