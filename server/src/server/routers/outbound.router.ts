import { router, protectedProcedure } from '../trpc';
import { outboundContract } from '@/contracts/inventory/outbound.contract';
import { outboundService } from '../services/outbound.service';

export const outboundRouter = router({
  list: protectedProcedure
    .input(outboundContract.list.input)
    .query(({ ctx, input }) =>
      outboundService.list(ctx, {
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
    .input(outboundContract.detail.input)
    .query(({ ctx, input }) => outboundService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(outboundContract.create.input)
    .mutation(({ ctx, input }) => outboundService.create(ctx, input)),

  update: protectedProcedure
    .input(outboundContract.update.input)
    .mutation(({ ctx, input }) => outboundService.update(ctx, input)),

  delete: protectedProcedure
    .input(outboundContract.delete.input)
    .mutation(({ ctx, input }) => outboundService.delete(ctx, input.id)),

  addLine: protectedProcedure
    .input(outboundContract.addLine.input)
    .mutation(({ ctx, input }) => outboundService.addLine(ctx, input)),

  updateLine: protectedProcedure
    .input(outboundContract.updateLine.input)
    .mutation(({ ctx, input }) => outboundService.updateLine(ctx, input)),

  removeLine: protectedProcedure
    .input(outboundContract.removeLine.input)
    .mutation(({ ctx, input }) => outboundService.removeLine(ctx, input.id)),

  listLines: protectedProcedure
    .input(outboundContract.listLines.input)
    .query(({ ctx, input }) => outboundService.listLines(ctx, input.outboundId)),

  transition: protectedProcedure
    .input(outboundContract.transition.input)
    .mutation(({ ctx, input }) => outboundService.transition(ctx, input)),

  submit: protectedProcedure
    .input(outboundContract.submit.input)
    .mutation(({ ctx, input }) => outboundService.submit(ctx, input.id)),

  audit: protectedProcedure
    .input(outboundContract.audit.input)
    .mutation(({ ctx, input }) => outboundService.audit(ctx, input.id)),

  ship: protectedProcedure
    .input(outboundContract.ship.input)
    .mutation(({ ctx, input }) => outboundService.ship(ctx, input.id)),

  finish: protectedProcedure
    .input(outboundContract.finish.input)
    .mutation(({ ctx, input }) => outboundService.finish(ctx, input.id)),

  void: protectedProcedure
    .input(outboundContract.void.input)
    .mutation(({ ctx, input }) => outboundService.void(ctx, input.id)),
});
