import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const StocktakeKind = z.enum(['FULL', 'SAMPLING', 'DYNAMIC']);

// State machine: 10=draft 20=frozen 25=submitted 30=committed 40=finished 90=cancelled
// Transitions: 10->20 freeze, 20->25 submit, 25->30 commit, 30->40 finish, 10|20->90 cancel
export const StocktakeStatus = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(25),
  z.literal(30),
  z.literal(40),
  z.literal(90),
]);

export const StocktakeLineSchema = z.object({
  id: BigIntId,
  stocktakeId: BigIntId,
  goodsId: BigIntId,
  locationId: BigIntId,
  batchNo: z.string().nullable(),
  bookQty: Decimal,
  actualQty: Decimal.nullable(),
  difference: Decimal.nullable(),
  reason: z.string().nullable(),
});

export const StocktakeSchema = z.object({
  id: BigIntId,
  docNo: z.string(),
  kind: StocktakeKind,
  warehouseId: BigIntId,
  locationIds: z.array(BigIntId).nullable(),
  categoryIds: z.array(BigIntId).nullable(),
  operatorId: BigIntId,
  operationAt: z.date(),
  reason: z.string().nullable(),
  remark: z.string().nullable(),
  status: StocktakeStatus,
  statusUpdatedAt: z.date().nullable(),
  statusUpdatedBy: BigIntId.nullable(),
  gainDocNo: z.string().nullable(),
  lossDocNo: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

export const StocktakeWithLinesSchema = StocktakeSchema.extend({
  lines: z.array(StocktakeLineSchema),
});

const docNo = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);

// Header-only create input. Lines are produced by the freeze (10->20) snapshot,
// not provided by the caller — this matches the stocktake business flow.
export const StocktakeCreateInput = z.object({
  docNo: docNo.optional(),
  kind: StocktakeKind,
  warehouseId: BigIntId,
  locationIds: z.array(BigIntId).optional(),
  categoryIds: z.array(BigIntId).optional(),
  operatorId: BigIntId,
  operationAt: z.date(),
  reason: z.string().max(256).optional(),
  remark: z.string().max(256).optional(),
});

export const StocktakeUpdateInput = z.object({
  id: BigIntId,
  kind: StocktakeKind.optional(),
  warehouseId: BigIntId.optional(),
  locationIds: z.array(BigIntId).optional(),
  categoryIds: z.array(BigIntId).optional(),
  operatorId: BigIntId.optional(),
  operationAt: z.date().optional(),
  reason: z.string().max(256).optional(),
  remark: z.string().max(256).optional(),
  version: z.number().int().nonnegative(),
});

export const StocktakeListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  kind: StocktakeKind.optional(),
  warehouseId: BigIntId.optional(),
  status: StocktakeStatus.optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  sort: SortInput,
});

export const StocktakeListOutput = PageResult(StocktakeSchema);

export const AddLineInput = z.object({
  stocktakeId: BigIntId,
  goodsId: BigIntId,
  locationId: BigIntId,
  batchNo: z.string().max(64).optional(),
  bookQty: Decimal,
  actualQty: Decimal.optional(),
  difference: Decimal.optional(),
  reason: z.string().max(256).optional(),
});

export const UpdateLineInput = z.object({
  id: BigIntId,
  goodsId: BigIntId.optional(),
  locationId: BigIntId.optional(),
  batchNo: z.string().max(64).optional(),
  bookQty: Decimal.optional(),
  actualQty: Decimal.optional(),
  difference: Decimal.optional(),
  reason: z.string().max(256).optional(),
});

export const RemoveLineInput = z.object({ id: BigIntId });

export const ListLinesInput = z.object({ stocktakeId: BigIntId });

// Special operation for status=20 (frozen): user inputs the physical count.
// difference is server-computed (actualQty - bookQty) but accepted for client-side preview.
export const UpdateLineActualInput = z.object({
  id: BigIntId,
  actualQty: Decimal,
  reason: z.string().max(256).optional(),
});

export const TransitionInput = z.object({
  id: BigIntId,
  from: StocktakeStatus,
  to: StocktakeStatus,
  reason: z.string().max(256).optional(),
});

export const StatusActionInput = z.object({
  id: BigIntId,
  reason: z.string().max(256).optional(),
});

export const stocktakeContract = {
  list: { input: StocktakeListInput, output: StocktakeListOutput },
  detail: { input: IdParam, output: StocktakeWithLinesSchema },
  create: { input: StocktakeCreateInput, output: StocktakeWithLinesSchema },
  update: { input: StocktakeUpdateInput, output: StocktakeSchema },
  delete: { input: IdParam, output: OkResp },
  addLine: { input: AddLineInput, output: StocktakeLineSchema },
  updateLine: { input: UpdateLineInput, output: StocktakeLineSchema },
  removeLine: { input: RemoveLineInput, output: OkResp },
  listLines: { input: ListLinesInput, output: z.array(StocktakeLineSchema) },
  updateLineActual: { input: UpdateLineActualInput, output: StocktakeLineSchema },
  transition: { input: TransitionInput, output: StocktakeSchema },
  freeze: { input: StatusActionInput, output: StocktakeSchema },
  submit: { input: StatusActionInput, output: StocktakeSchema },
  commit: { input: StatusActionInput, output: StocktakeSchema },
  finish: { input: StatusActionInput, output: StocktakeSchema },
  cancel: { input: StatusActionInput, output: StocktakeSchema },
};
