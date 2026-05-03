import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const LocationStatus = z.enum(['ACTIVE', 'DISABLED']);

export const LocationSchema = z.object({
  id: BigIntId,
  warehouseId: BigIntId,
  code: z.string(),
  name: z.string(),
  capacity: Decimal.nullable(),
  status: LocationStatus,
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

const code = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);
const name = z.string().min(1).max(128);

export const LocationCreateInput = z.object({
  warehouseId: BigIntId,
  code,
  name,
  capacity: Decimal.optional(),
});

export const LocationUpdateInput = z.object({
  id: BigIntId,
  name: name.optional(),
  capacity: Decimal.optional(),
  status: LocationStatus.optional(),
  version: z.number().int().nonnegative(),
});

export const LocationListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  warehouseId: BigIntId.optional(),
  status: LocationStatus.optional(),
  sort: SortInput,
});

export const LocationListOutput = PageResult(LocationSchema);

export const locationContract = {
  list: { input: LocationListInput, output: LocationListOutput },
  detail: { input: IdParam, output: LocationSchema },
  create: { input: LocationCreateInput, output: LocationSchema },
  update: { input: LocationUpdateInput, output: LocationSchema },
  delete: { input: IdParam, output: OkResp },
  restore: { input: IdParam, output: LocationSchema },
};
