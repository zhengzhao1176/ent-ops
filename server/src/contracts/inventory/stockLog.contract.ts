import { z } from 'zod';
import { BigIntId, IdParam, Pagination, PageResult, SortInput } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const StockLogSchema = z.object({
  id: BigIntId,
  stockId: BigIntId,
  warehouseId: BigIntId,
  goodsId: BigIntId,
  changeType: z.string(),
  qtyBefore: Decimal,
  qtyChange: Decimal,
  qtyAfter: Decimal,
  refDocNo: z.string().nullable(),
  operatorId: BigIntId.nullable(),
  createdAt: z.date(),
});

// P-CRUD-IMMUTABLE: list + detail only. Update/delete intentionally absent.
export const StockLogCreateInput = z.never();
export const StockLogUpdateInput = z.never();

export const StockLogListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  stockId: BigIntId.optional(),
  goodsId: BigIntId.optional(),
  warehouseId: BigIntId.optional(),
  changeType: z.string().max(32).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  sort: SortInput,
});

export const StockLogListOutput = PageResult(StockLogSchema);

export const stockLogContract = {
  list: { input: StockLogListInput, output: StockLogListOutput },
  detail: { input: IdParam, output: StockLogSchema },
};
