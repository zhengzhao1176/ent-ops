import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const GoodsStatus = z.enum(['ACTIVE', 'DISABLED']);

export const GoodsSchema = z.object({
  id: BigIntId,
  code: z.string(),
  name: z.string(),
  categoryId: BigIntId,
  unitId: BigIntId,
  spec: z.string().nullable(),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  safetyStock: Decimal.nullable(),
  stockUpper: Decimal.nullable(),
  shelfLifeDays: z.number().int().nullable(),
  image: z.string().nullable(),
  status: GoodsStatus,
  remark: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

const code = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const name = z.string().min(1).max(128);

export const GoodsCreateInput = z.object({
  code,
  name,
  categoryId: BigIntId,
  unitId: BigIntId,
  spec: z.string().max(128).optional(),
  brand: z.string().max(64).optional(),
  barcode: z.string().max(64).optional(),
  safetyStock: Decimal.optional(),
  stockUpper: Decimal.optional(),
  shelfLifeDays: z.number().int().nonnegative().optional(),
  image: z.string().max(512).optional(),
  remark: z.string().max(256).optional(),
});

export const GoodsUpdateInput = z.object({
  id: BigIntId,
  name: name.optional(),
  categoryId: BigIntId.optional(),
  spec: z.string().max(128).optional(),
  brand: z.string().max(64).optional(),
  barcode: z.string().max(64).optional(),
  safetyStock: Decimal.optional(),
  stockUpper: Decimal.optional(),
  shelfLifeDays: z.number().int().nonnegative().optional(),
  image: z.string().max(512).optional(),
  remark: z.string().max(256).optional(),
  version: z.number().int().nonnegative(),
});

export const GoodsListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  categoryId: BigIntId.optional(),
  status: GoodsStatus.optional(),
  sort: SortInput,
});

export const GoodsListOutput = PageResult(GoodsSchema);

export const StatusActionInput = z.object({
  id: BigIntId,
  reason: z.string().max(256).optional(),
});

export const goodsContract = {
  list: { input: GoodsListInput, output: GoodsListOutput },
  detail: { input: IdParam, output: GoodsSchema },
  create: { input: GoodsCreateInput, output: GoodsSchema },
  update: { input: GoodsUpdateInput, output: GoodsSchema },
  delete: { input: IdParam, output: OkResp },
  restore: { input: IdParam, output: GoodsSchema },
  disable: { input: StatusActionInput, output: GoodsSchema },
};
