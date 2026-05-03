import { router, protectedProcedure } from '../trpc';
import { categoryContract } from '@/contracts/inventory/category.contract';
import { categoryService } from '../services/category.service';

export const categoryRouter = router({
  tree: protectedProcedure
    .input(categoryContract.tree.input)
    .query(({ ctx }) => categoryService.tree(ctx)),

  list: protectedProcedure
    .input(categoryContract.list.input)
    .query(({ ctx, input }) => categoryService.list(ctx, input)),

  detail: protectedProcedure
    .input(categoryContract.detail.input)
    .query(({ ctx, input }) => categoryService.detail(ctx, input.id)),

  create: protectedProcedure
    .input(categoryContract.create.input)
    .mutation(({ ctx, input }) => categoryService.create(ctx, input)),

  update: protectedProcedure
    .input(categoryContract.update.input)
    .mutation(({ ctx, input }) => categoryService.update(ctx, input)),

  delete: protectedProcedure
    .input(categoryContract.delete.input)
    .mutation(({ ctx, input }) => categoryService.softDelete(ctx, input.id)),

  move: protectedProcedure
    .input(categoryContract.move.input)
    .mutation(({ ctx, input }) => categoryService.move(ctx, input)),

  listChildren: protectedProcedure
    .input(categoryContract.listChildren.input)
    .query(({ ctx, input }) => categoryService.listChildren(ctx, input.parentId)),

  listAncestors: protectedProcedure
    .input(categoryContract.listAncestors.input)
    .query(({ ctx, input }) => categoryService.listAncestors(ctx, input.id)),
});
