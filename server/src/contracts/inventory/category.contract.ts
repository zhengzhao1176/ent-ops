import { z } from 'zod';
import { BigIntId, IdParam, OkResp } from '../_shared';

export const CategoryStatus = z.enum(['ACTIVE', 'DISABLED']);

export const CategorySchema = z.object({
  id: BigIntId,
  code: z.string(),
  name: z.string(),
  parentId: BigIntId.nullable(),
  path: z.string(),
  depth: z.number().int().nonnegative(),
  sort: z.number().int(),
  status: CategoryStatus,
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

export const CategoryCreateInput = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  parentId: BigIntId.optional(),
  sort: z.number().int().default(0),
});

export const CategoryUpdateInput = z.object({
  id: BigIntId,
  name: z.string().min(1).max(128).optional(),
  sort: z.number().int().optional(),
  status: CategoryStatus.optional(),
  version: z.number().int().nonnegative(),
});

export const CategoryListInput = z
  .object({
    parentId: BigIntId.optional(),
    status: CategoryStatus.optional(),
    keyword: z.string().max(128).optional(),
  })
  .optional();

export const categoryContract = {
  tree: { input: z.object({}).optional(), output: z.array(CategorySchema) },
  list: { input: CategoryListInput, output: z.array(CategorySchema) },
  detail: { input: IdParam, output: CategorySchema },
  create: { input: CategoryCreateInput, output: CategorySchema },
  update: { input: CategoryUpdateInput, output: CategorySchema },
  delete: { input: IdParam, output: OkResp },
  move: {
    input: z.object({ id: BigIntId, newParentId: BigIntId.optional() }),
    output: CategorySchema,
  },
  listChildren: {
    input: z.object({ parentId: BigIntId.optional() }),
    output: z.array(CategorySchema),
  },
  listAncestors: {
    input: IdParam,
    output: z.array(CategorySchema),
  },
};
