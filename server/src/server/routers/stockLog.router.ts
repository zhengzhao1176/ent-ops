import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { stockLogContract } from '@/contracts/inventory/stockLog.contract';
import { stockLogRepo } from '../repositories/stockLog.repo';

export const stockLogRouter = router({
  list: protectedProcedure
    .input(stockLogContract.list.input)
    .query(({ ctx, input }) =>
      stockLogRepo.findPage(ctx.prisma, {
        page: input.page,
        pageSize: input.pageSize,
        stockId: input.stockId,
        goodsId: input.goodsId,
        warehouseId: input.warehouseId,
        changeType: input.changeType,
        from: input.from,
        to: input.to,
        sortField: input.sort?.field,
        sortOrder: input.sort?.order,
      }),
    ),

  detail: protectedProcedure
    .input(stockLogContract.detail.input)
    .query(async ({ ctx, input }) => {
      const log = await stockLogRepo.findById(ctx.prisma, input.id);
      if (!log) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '库存流水不存在' });
      }
      return log;
    }),
});
