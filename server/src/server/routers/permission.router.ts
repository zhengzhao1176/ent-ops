import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { IdParam } from '@/contracts/_shared';
import { PermissionCreateInput } from '@/contracts/user/permission.contract';
import { permissionRepo } from '../repositories/permission.repo';

export const permissionRouter = router({
  list: protectedProcedure
    .input(z.object({ kind: z.enum(['MENU', 'ACTION', 'DATA']).optional() }).optional())
    .query(({ ctx, input }) => permissionRepo.list(ctx.prisma, input?.kind)),
  tree: protectedProcedure.query(({ ctx }) => permissionRepo.list(ctx.prisma)),
  detail: protectedProcedure.input(IdParam).query(async ({ ctx, input }) => {
    const p = await permissionRepo.findById(ctx.prisma, input.id);
    if (!p) {
      const { TRPCError } = await import('@trpc/server');
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return p;
  }),
  create: protectedProcedure.input(PermissionCreateInput).mutation(({ ctx, input }) =>
    permissionRepo.create(ctx.prisma, input),
  ),
  delete: protectedProcedure.input(IdParam).mutation(async ({ ctx, input }) => {
    await permissionRepo.delete(ctx.prisma, input.id);
    return { ok: true as const };
  }),
  checkMine: protectedProcedure
    .input(z.object({ codes: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const owned = new Set(await permissionRepo.listForUser(ctx.prisma, ctx.user!.id));
      return Object.fromEntries(input.codes.map((c) => [c, owned.has(c) || ctx.user!.isSuperAdmin]));
    }),
});
