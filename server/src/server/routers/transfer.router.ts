import { router, protectedProcedure } from '../trpc';
import { transferContract } from '@/contracts/inventory/transfer.contract';
import { transferService } from '../services/transfer.service';

export const transferRouter = router({
  list: protectedProcedure
    .input(transferContract.list.input)
    .query(({ ctx, input }) =>
      transferService.list(ctx, {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.keyword,
        kind: input.kind,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        status: input.status,
        from: input.from,
        to: input.to,
        sortField: input.sort?.field,
        sortOrder: input.sort?.order,
      }),
    ),

  detail: protectedProcedure
    .input(transferContract.detail.input)
    .query(({ ctx, input }) => transferService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(transferContract.create.input)
    .mutation(({ ctx, input }) => transferService.create(ctx, input)),

  update: protectedProcedure
    .input(transferContract.update.input)
    .mutation(({ ctx, input }) => transferService.update(ctx, input)),

  delete: protectedProcedure
    .input(transferContract.delete.input)
    .mutation(({ ctx, input }) => transferService.delete(ctx, input.id)),

  addLine: protectedProcedure
    .input(transferContract.addLine.input)
    .mutation(({ ctx, input }) => transferService.addLine(ctx, input)),

  updateLine: protectedProcedure
    .input(transferContract.updateLine.input)
    .mutation(({ ctx, input }) => transferService.updateLine(ctx, input)),

  removeLine: protectedProcedure
    .input(transferContract.removeLine.input)
    .mutation(({ ctx, input }) => transferService.removeLine(ctx, input.id)),

  listLines: protectedProcedure
    .input(transferContract.listLines.input)
    .query(({ ctx, input }) => transferService.listLines(ctx, input.transferId)),

  transition: protectedProcedure
    .input(transferContract.transition.input)
    .mutation(({ ctx, input }) => transferService.transition(ctx, input)),

  submit: protectedProcedure
    .input(transferContract.submit.input)
    .mutation(({ ctx, input }) => transferService.submit(ctx, input.id)),

  audit: protectedProcedure
    .input(transferContract.audit.input)
    .mutation(({ ctx, input }) => transferService.audit(ctx, input.id)),

  receive: protectedProcedure
    .input(transferContract.receive.input)
    .mutation(({ ctx, input }) => transferService.receive(ctx, input.id)),

  finish: protectedProcedure
    .input(transferContract.finish.input)
    .mutation(({ ctx, input }) => transferService.finish(ctx, input.id)),

  void: protectedProcedure
    .input(transferContract.void.input)
    .mutation(({ ctx, input }) => transferService.void(ctx, input.id)),
});
