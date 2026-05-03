import { z } from 'zod';
import { BigIntId, IdParam, Pagination, PageResult, SortInput } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const StockSchema = z.object({
  id: BigIntId,
  warehouseId: BigIntId,
  locationId: BigIntId,
  goodsId: BigIntId,
  batchNo: z.string(),
  qtyOnHand: Decimal,
  qtyLocked: Decimal,
  qtyAvailable: Decimal,
  qtyInTransit: Decimal,
  expireAt: z.date().nullable(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

// P-CRUD-READONLY does not allow create/update/delete inputs.
// Schemas exported for type-source consistency only.
export const StockCreateInput = z.never();
export const StockUpdateInput = z.never();

export const StockListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  warehouseId: BigIntId.optional(),
  locationId: BigIntId.optional(),
  goodsId: BigIntId.optional(),
  batchNo: z.string().max(64).optional(),
  sort: SortInput,
});

export const StockListOutput = PageResult(StockSchema);

export const StockSummaryInput = z
  .object({
    warehouseId: BigIntId.optional(),
    categoryId: BigIntId.optional(),
  })
  .optional();

export const StockSummaryOutput = z.object({
  totalGoods: z.number().int().nonnegative(),
  totalOnHand: Decimal,
  totalLocked: Decimal,
  totalAvailable: Decimal,
  totalInTransit: Decimal,
});

export const StockByGoodsInput = z.object({
  goodsId: BigIntId,
  warehouseId: BigIntId.optional(),
});

export const StockByGoodsOutput = z.array(
  z.object({
    warehouseId: BigIntId,
    locationId: BigIntId,
    batchNo: z.string(),
    qtyOnHand: Decimal,
    qtyAvailable: Decimal,
    qtyLocked: Decimal,
    qtyInTransit: Decimal,
    expireAt: z.date().nullable(),
  }),
);

export const stockContract = {
  list: { input: StockListInput, output: StockListOutput },
  detail: { input: IdParam, output: StockSchema },
  summary: { input: StockSummaryInput, output: StockSummaryOutput },
  byGoods: { input: StockByGoodsInput, output: StockByGoodsOutput },
};
