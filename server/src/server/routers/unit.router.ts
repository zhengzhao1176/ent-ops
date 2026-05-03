import { router, protectedProcedure } from '../trpc';
import { unitContract } from '@/contracts/inventory/unit.contract';
import { unitService } from '../services/unit.service';

export const unitRouter = router({
  list: protectedProcedure
    .input(unitContract.list.input)
    .query(({ ctx, input }) => unitService.list(ctx, input)),

  detail: protectedProcedure
    .input(unitContract.detail.input)
    .query(({ ctx, input }) => unitService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(unitContract.create.input)
    .mutation(({ ctx, input }) => unitService.create(ctx, input)),

  update: protectedProcedure
    .input(unitContract.update.input)
    .mutation(({ ctx, input }) => unitService.update(ctx, input)),

  delete: protectedProcedure
    .input(unitContract.delete.input)
    .mutation(({ ctx, input }) => unitService.delete(ctx, input.id)),
});
