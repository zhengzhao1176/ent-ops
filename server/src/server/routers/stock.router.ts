import { router, protectedProcedure } from '../trpc';
import { stockContract } from '@/contracts/inventory/stock.contract';
import { stockService } from '../services/stock.service';
import { stockRepo } from '../repositories/stock.repo';

export const stockRouter = router({
  list: protectedProcedure
    .input(stockContract.list.input)
    .query(({ ctx, input }) =>
      stockService.list(ctx.prisma, {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.keyword,
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        goodsId: input.goodsId,
        batchNo: input.batchNo,
        sortField: input.sort?.field,
        sortOrder: input.sort?.order,
      }),
    ),

  detail: protectedProcedure
    .input(stockContract.detail.input)
    .query(({ ctx, input }) => stockService.detail(ctx.prisma, input.id)),

  summary: protectedProcedure
    .input(stockContract.summary.input)
    .query(({ ctx, input }) => stockService.summary(ctx.prisma, input)),

  byGoods: protectedProcedure
    .input(stockContract.byGoods.input)
    .query(({ ctx, input }) =>
      stockRepo.listByGoods(ctx.prisma, input.goodsId, input.warehouseId),
    ),
});
