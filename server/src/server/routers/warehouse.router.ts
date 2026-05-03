import { router, protectedProcedure } from '../trpc';
import { warehouseContract } from '@/contracts/inventory/warehouse.contract';
import { warehouseService } from '../services/warehouse.service';

export const warehouseRouter = router({
  list: protectedProcedure
    .input(warehouseContract.list.input)
    .query(({ ctx, input }) =>
      warehouseService.list(ctx, {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.keyword,
        kind: input.kind,
        status: input.status,
        sortField: input.sort?.field,
        sortOrder: input.sort?.order,
      }),
    ),

  detail: protectedProcedure
    .input(warehouseContract.detail.input)
    .query(({ ctx, input }) => warehouseService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(warehouseContract.create.input)
    .mutation(({ ctx, input }) => warehouseService.create(ctx, input)),

  update: protectedProcedure
    .input(warehouseContract.update.input)
    .mutation(({ ctx, input }) => warehouseService.update(ctx, input)),

  delete: protectedProcedure
    .input(warehouseContract.delete.input)
    .mutation(({ ctx, input }) => warehouseService.softDelete(ctx, input.id)),

  restore: protectedProcedure
    .input(warehouseContract.restore.input)
    .mutation(({ ctx, input }) => warehouseService.restore(ctx, input.id)),
});
