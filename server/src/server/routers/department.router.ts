import { router, protectedProcedure } from '../trpc';
import {
  DepartmentCreateInput,
  DepartmentUpdateInput,
} from '@/contracts/user/department.contract';
import { IdParam, BigIntId } from '@/contracts/_shared';
import { z } from 'zod';
import { deptRepo } from '../repositories/department.repo';
import { departmentService } from '../services/department.service';

export const departmentRouter = router({
  tree: protectedProcedure.query(({ ctx }) => deptRepo.tree(ctx.prisma)),
  list: protectedProcedure
    .input(z.object({ parentId: BigIntId.optional() }).optional())
    .query(({ ctx, input }) => deptRepo.list(ctx.prisma, input?.parentId)),
  detail: protectedProcedure.input(IdParam).query(async ({ ctx, input }) => {
    const d = await deptRepo.findById(ctx.prisma, input.id);
    if (!d) {
      const { TRPCError } = await import('@trpc/server');
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return d;
  }),
  create: protectedProcedure.input(DepartmentCreateInput).mutation(({ ctx, input }) =>
    departmentService.create(ctx, input),
  ),
  update: protectedProcedure.input(DepartmentUpdateInput).mutation(({ ctx, input }) =>
    departmentService.update(ctx, input),
  ),
  delete: protectedProcedure.input(IdParam).mutation(({ ctx, input }) =>
    departmentService.softDelete(ctx, input.id),
  ),
  move: protectedProcedure
    .input(z.object({ id: BigIntId, newParentId: BigIntId.optional() }))
    .mutation(({ ctx, input }) => departmentService.move(ctx, input)),
});
