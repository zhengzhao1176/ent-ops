import { router, protectedProcedure } from '../trpc';
import { reportContract } from '@/contracts/inventory/report.contract';
import { reportService } from '../services/report.service';

export const reportRouter = router({
  summary: protectedProcedure
    .input(reportContract.summary.input)
    .query(({ ctx, input }) => reportService.summary(ctx, input)),

  dailyMovement: protectedProcedure
    .input(reportContract.dailyMovement.input)
    .query(({ ctx, input }) => reportService.dailyMovement(ctx, input)),

  topGoodsByMovement: protectedProcedure
    .input(reportContract.topGoodsByMovement.input)
    .query(({ ctx, input }) => reportService.topGoodsByMovement(ctx, input)),

  slowMovingGoods: protectedProcedure
    .input(reportContract.slowMovingGoods.input)
    .query(({ ctx, input }) => reportService.slowMovingGoods(ctx, input)),

  stockByWarehouse: protectedProcedure
    .input(reportContract.stockByWarehouse.input)
    .query(({ ctx }) => reportService.stockByWarehouse(ctx)),
});
