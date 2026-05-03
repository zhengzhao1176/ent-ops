import { router, protectedProcedure } from '../trpc';
import {
  RoleCreateInput,
  RoleUpdateInput,
  RoleListInput,
  AssignPermsInput,
} from '@/contracts/user/role.contract';
import { IdParam } from '@/contracts/_shared';
import { roleService } from '../services/role.service';
import { roleRepo } from '../repositories/role.repo';
import { z } from 'zod';

export const roleRouter = router({
  list: protectedProcedure.input(RoleListInput).query(({ ctx, input }) =>
    roleRepo.findPage(ctx.prisma, {
      page: input.page,
      pageSize: input.pageSize,
      keyword: input.keyword,
      isBuiltin: input.isBuiltin,
    }),
  ),
  detail: protectedProcedure.input(IdParam).query(async ({ ctx, input }) => {
    const r = await roleRepo.findById(ctx.prisma, input.id);
    if (!r) {
      const { TRPCError } = await import('@trpc/server');
      throw new TRPCError({ code: 'NOT_FOUND', message: '角色不存在' });
    }
    return r;
  }),
  create: protectedProcedure.input(RoleCreateInput).mutation(({ ctx, input }) => roleService.create(ctx, input)),
  update: protectedProcedure.input(RoleUpdateInput).mutation(({ ctx, input }) => roleService.update(ctx, input)),
  delete: protectedProcedure.input(IdParam).mutation(({ ctx, input }) => roleService.softDelete(ctx, input.id)),
  restore: protectedProcedure.input(IdParam).mutation(async ({ ctx, input }) => {
    await ctx.prisma.role.update({ where: { id: input.id }, data: { deletedAt: null } });
    const r = await roleRepo.findById(ctx.prisma, input.id);
    return r!;
  }),
  assignPermissions: protectedProcedure
    .input(AssignPermsInput)
    .mutation(({ ctx, input }) => roleService.assignPermissions(ctx, input.roleId, input.permissionIds)),
  listUsers: protectedProcedure
    .input(z.object({ roleId: z.bigint().or(z.string().regex(/^\d+$/).transform(BigInt)), page: z.number().default(1), pageSize: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const total = await ctx.prisma.userRole.count({ where: { roleId: input.roleId } });
      const items = await ctx.prisma.userRole.findMany({
        where: { roleId: input.roleId },
        include: { user: true },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      });
      return { total, items: items.map((ur) => ({ id: ur.user.id, username: ur.user.username, realName: ur.user.realName })) };
    }),
});
