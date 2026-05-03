import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { AppContext } from './context';

const t = initTRPC.context<AppContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const requireUser = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '未登录' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireFreshPassword = middleware(({ ctx, next, path }) => {
  if (
    ctx.user &&
    ctx.user.mustChangePassword &&
    !path.startsWith('auth.changePassword') &&
    !path.startsWith('auth.me') &&
    !path.startsWith('auth.logout')
  ) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'MUST_CHANGE_PASSWORD' });
  }
  return next();
});

export const protectedProcedure = publicProcedure.use(requireUser).use(requireFreshPassword);

export function permissionProcedure(perm: string) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user!.isSuperAdmin) return next();
    if (!ctx.user!.permissions.has(perm)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `缺少权限: ${perm}` });
    }
    return next();
  });
}
