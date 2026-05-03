import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

export const WarehouseKind = z.enum(['FINISHED', 'RAW', 'RETURN', 'DEFECT']);
export const WarehouseStatus = z.enum(['ACTIVE', 'DISABLED']);

export const WarehouseSchema = z.object({
  id: BigIntId,
  code: z.string(),
  name: z.string(),
  kind: WarehouseKind,
  address: z.string().nullable(),
  managerId: BigIntId.nullable(),
  status: WarehouseStatus,
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

const code = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);
const name = z.string().min(1).max(128);

export const WarehouseCreateInput = z.object({
  code,
  name,
  kind: WarehouseKind,
  address: z.string().max(256).optional(),
  managerId: BigIntId.optional(),
});

export const WarehouseUpdateInput = z.object({
  id: BigIntId,
  name: name.optional(),
  kind: WarehouseKind.optional(),
  address: z.string().max(256).optional(),
  managerId: BigIntId.optional(),
  status: WarehouseStatus.optional(),
  version: z.number().int().nonnegative(),
});

export const WarehouseListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  kind: WarehouseKind.optional(),
  status: WarehouseStatus.optional(),
  sort: SortInput,
});

export const WarehouseListOutput = PageResult(WarehouseSchema);

export const warehouseContract = {
  list: { input: WarehouseListInput, output: WarehouseListOutput },
  detail: { input: IdParam, output: WarehouseSchema },
  create: { input: WarehouseCreateInput, output: WarehouseSchema },
  update: { input: WarehouseUpdateInput, output: WarehouseSchema },
  delete: { input: IdParam, output: OkResp },
  restore: { input: IdParam, output: WarehouseSchema },
};
