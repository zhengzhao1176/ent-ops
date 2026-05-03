import { router, protectedProcedure } from '../trpc';
import { inboundContract } from '@/contracts/inventory/inbound.contract';
import { inboundService } from '../services/inbound.service';

export const inboundRouter = router({
  list: protectedProcedure
    .input(inboundContract.list.input)
    .query(({ ctx, input }) =>
      inboundService.list(ctx, {
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
    .input(inboundContract.detail.input)
    .query(({ ctx, input }) => inboundService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(inboundContract.create.input)
    .mutation(({ ctx, input }) => inboundService.create(ctx, input)),

  update: protectedProcedure
    .input(inboundContract.update.input)
    .mutation(({ ctx, input }) => inboundService.update(ctx, input)),

  delete: protectedProcedure
    .input(inboundContract.delete.input)
    .mutation(({ ctx, input }) => inboundService.delete(ctx, input.id)),

  addLine: protectedProcedure
    .input(inboundContract.addLine.input)
    .mutation(({ ctx, input }) => inboundService.addLine(ctx, input)),

  updateLine: protectedProcedure
    .input(inboundContract.updateLine.input)
    .mutation(({ ctx, input }) => inboundService.updateLine(ctx, input)),

  removeLine: protectedProcedure
    .input(inboundContract.removeLine.input)
    .mutation(({ ctx, input }) => inboundService.removeLine(ctx, input.id)),

  listLines: protectedProcedure
    .input(inboundContract.listLines.input)
    .query(({ ctx, input }) => inboundService.listLines(ctx, input.inboundId)),

  transition: protectedProcedure
    .input(inboundContract.transition.input)
    .mutation(({ ctx, input }) => inboundService.transition(ctx, input)),

  submit: protectedProcedure
    .input(inboundContract.submit.input)
    .mutation(({ ctx, input }) => inboundService.submit(ctx, input.id)),

  audit: protectedProcedure
    .input(inboundContract.audit.input)
    .mutation(({ ctx, input }) => inboundService.audit(ctx, input.id)),

  void: protectedProcedure
    .input(inboundContract.void.input)
    .mutation(({ ctx, input }) => inboundService.void(ctx, input.id)),

  finish: protectedProcedure
    .input(inboundContract.finish.input)
    .mutation(({ ctx, input }) => inboundService.finish(ctx, input.id)),
});
