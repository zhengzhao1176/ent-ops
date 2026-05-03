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

/**
 * Shape of inventory procedures that integration tests expect. The actual
 * routers may not yet be registered on `appRouter` (TDD RED phase), so we
 * widen the caller type here to keep `tsc --noEmit` clean while letting the
 * runtime fail with TRPC `NOT_FOUND` for missing procedures.
 */
type AnyProc = (input?: unknown) => Promise<any>;
type AnyRouter = Record<string, AnyProc>;
type InventoryShim = {
  goods: AnyRouter;
  inbound: AnyRouter;
  outbound: AnyRouter;
  transfer: AnyRouter;
  warehouse: AnyRouter;
  location: AnyRouter;
  stock: AnyRouter;
  stockLog: AnyRouter;
  category: AnyRouter;
  unit: AnyRouter;
};

export type AppCaller = ReturnType<typeof appRouter.createCaller> & InventoryShim;

export function callerFor(user?: AuthUser, ip = '127.0.0.1'): AppCaller {
  return appRouter.createCaller(createContext({ user, ip, prisma: getPrisma() })) as AppCaller;
}

export async function callerForUserId(userId: bigint): Promise<AppCaller> {
  const u = await buildAuthUser(userId);
  return callerFor(u);
}

export const anonymousCaller = (): AppCaller => callerFor(undefined);
