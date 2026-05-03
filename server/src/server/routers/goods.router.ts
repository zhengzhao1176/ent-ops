import { router, protectedProcedure } from '../trpc';
import { goodsContract } from '@/contracts/inventory/goods.contract';
import { goodsService } from '../services/goods.service';

export const goodsRouter = router({
  list: protectedProcedure
    .input(goodsContract.list.input)
    .query(({ ctx, input }) =>
      goodsService.list(ctx, {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.keyword,
        categoryId: input.categoryId,
        status: input.status,
        sortField: input.sort?.field,
        sortOrder: input.sort?.order,
      }),
    ),

  detail: protectedProcedure
    .input(goodsContract.detail.input)
    .query(({ ctx, input }) => goodsService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(goodsContract.create.input)
    .mutation(({ ctx, input }) => goodsService.create(ctx, input)),

  update: protectedProcedure
    .input(goodsContract.update.input)
    .mutation(({ ctx, input }) => goodsService.update(ctx, input)),

  delete: protectedProcedure
    .input(goodsContract.delete.input)
    .mutation(({ ctx, input }) => goodsService.softDelete(ctx, input.id)),

  restore: protectedProcedure
    .input(goodsContract.restore.input)
    .mutation(({ ctx, input }) => goodsService.restore(ctx, input.id)),

  disable: protectedProcedure
    .input(goodsContract.disable.input)
    .mutation(({ ctx, input }) => goodsService.disable(ctx, input.id)),
});
