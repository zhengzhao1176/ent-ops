import { router, protectedProcedure } from '../trpc';
import { stocktakeContract } from '@/contracts/inventory/stocktake.contract';
import { stocktakeService } from '../services/stocktake.service';

export const stocktakeRouter = router({
  list: protectedProcedure
    .input(stocktakeContract.list.input)
    .query(({ ctx, input }) =>
      stocktakeService.list(ctx, {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.keyword,
        kind: input.kind,
        warehouseId: input.warehouseId,
        status: input.status,
        from: input.from,
        to: input.to,
        sortField: input.sort?.field,
        sortOrder: input.sort?.order,
      }),
    ),

  detail: protectedProcedure
    .input(stocktakeContract.detail.input)
    .query(({ ctx, input }) => stocktakeService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(stocktakeContract.create.input)
    .mutation(({ ctx, input }) => stocktakeService.create(ctx, input)),

  update: protectedProcedure
    .input(stocktakeContract.update.input)
    .mutation(({ ctx, input }) => stocktakeService.update(ctx, input)),

  delete: protectedProcedure
    .input(stocktakeContract.delete.input)
    .mutation(({ ctx, input }) => stocktakeService.delete(ctx, input.id)),

  addLine: protectedProcedure
    .input(stocktakeContract.addLine.input)
    .mutation(({ ctx, input }) => stocktakeService.addLine(ctx, input)),

  updateLine: protectedProcedure
    .input(stocktakeContract.updateLine.input)
    .mutation(({ ctx, input }) => stocktakeService.updateLine(ctx, input)),

  removeLine: protectedProcedure
    .input(stocktakeContract.removeLine.input)
    .mutation(({ ctx, input }) => stocktakeService.removeLine(ctx, input.id)),

  listLines: protectedProcedure
    .input(stocktakeContract.listLines.input)
    .query(({ ctx, input }) => stocktakeService.listLines(ctx, input.stocktakeId)),

  updateLineActual: protectedProcedure
    .input(stocktakeContract.updateLineActual.input)
    .mutation(({ ctx, input }) => stocktakeService.updateLineActual(ctx, input)),

  transition: protectedProcedure
    .input(stocktakeContract.transition.input)
    .mutation(({ ctx, input }) => stocktakeService.transition(ctx, input)),

  freeze: protectedProcedure
    .input(stocktakeContract.freeze.input)
    .mutation(({ ctx, input }) => stocktakeService.freeze(ctx, input.id)),

  submit: protectedProcedure
    .input(stocktakeContract.submit.input)
    .mutation(({ ctx, input }) => stocktakeService.submit(ctx, input.id)),

  commit: protectedProcedure
    .input(stocktakeContract.commit.input)
    .mutation(({ ctx, input }) => stocktakeService.commit(ctx, input.id)),

  finish: protectedProcedure
    .input(stocktakeContract.finish.input)
    .mutation(({ ctx, input }) => stocktakeService.finish(ctx, input.id)),

  cancel: protectedProcedure
    .input(stocktakeContract.cancel.input)
    .mutation(({ ctx, input }) => stocktakeService.cancel(ctx, input.id)),
});
