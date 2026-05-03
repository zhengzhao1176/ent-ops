import { router, protectedProcedure } from '../trpc';
import { locationContract } from '@/contracts/inventory/location.contract';
import { locationService } from '../services/location.service';

export const locationRouter = router({
  list: protectedProcedure
    .input(locationContract.list.input)
    .query(({ ctx, input }) =>
      locationService.list(ctx, {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.keyword,
        warehouseId: input.warehouseId,
        status: input.status,
        sortField: input.sort?.field,
        sortOrder: input.sort?.order,
      }),
    ),

  detail: protectedProcedure
    .input(locationContract.detail.input)
    .query(({ ctx, input }) => locationService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(locationContract.create.input)
    .mutation(({ ctx, input }) => locationService.create(ctx, input)),

  update: protectedProcedure
    .input(locationContract.update.input)
    .mutation(({ ctx, input }) => locationService.update(ctx, input)),

  delete: protectedProcedure
    .input(locationContract.delete.input)
    .mutation(({ ctx, input }) => locationService.softDelete(ctx, input.id)),

  restore: protectedProcedure
    .input(locationContract.restore.input)
    .mutation(({ ctx, input }) => locationService.restore(ctx, input.id)),
});
