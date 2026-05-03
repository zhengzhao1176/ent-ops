import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const InboundKind = z.enum(['PURCHASE', 'RETURN', 'TRANSFER', 'STOCKTAKE', 'OTHER']);

// State machine states: 10=draft 20=submitted 30=audited 40=finished 90=void
export const InboundStatus = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(30),
  z.literal(40),
  z.literal(90),
]);

export const InboundLineSchema = z.object({
  id: BigIntId,
  inboundId: BigIntId,
  goodsId: BigIntId,
  locationId: BigIntId,
  batchNo: z.string(),
  qty: Decimal,
  unitPrice: Decimal.nullable(),
  expireAt: z.date().nullable(),
});

export const InboundSchema = z.object({
  id: BigIntId,
  docNo: z.string(),
  kind: InboundKind,
  sourceDocNo: z.string().nullable(),
  warehouseId: BigIntId,
  operatorId: BigIntId,
  operationAt: z.date(),
  remark: z.string().nullable(),
  status: InboundStatus,
  statusUpdatedAt: z.date().nullable(),
  statusUpdatedBy: BigIntId.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

export const InboundWithLinesSchema = InboundSchema.extend({
  lines: z.array(InboundLineSchema),
});

const docNo = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);

export const InboundLineCreateInput = z.object({
  goodsId: BigIntId,
  locationId: BigIntId,
  batchNo: z.string().max(64).optional(),
  qty: Decimal,
  unitPrice: Decimal.optional(),
  expireAt: z.date().optional(),
});

export const InboundCreateInput = z.object({
  docNo: docNo.optional(),
  kind: InboundKind,
  sourceDocNo: z.string().max(64).optional(),
  warehouseId: BigIntId,
  operatorId: BigIntId,
  operationAt: z.date(),
  remark: z.string().max(256).optional(),
  lines: z.array(InboundLineCreateInput).min(0),
});

export const InboundUpdateInput = z.object({
  id: BigIntId,
  kind: InboundKind.optional(),
  sourceDocNo: z.string().max(64).optional(),
  warehouseId: BigIntId.optional(),
  operatorId: BigIntId.optional(),
  operationAt: z.date().optional(),
  remark: z.string().max(256).optional(),
  version: z.number().int().nonnegative(),
});

export const InboundListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  kind: InboundKind.optional(),
  warehouseId: BigIntId.optional(),
  status: InboundStatus.optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  sort: SortInput,
});

export const InboundListOutput = PageResult(InboundSchema);

export const AddLineInput = z.object({
  inboundId: BigIntId,
  goodsId: BigIntId,
  locationId: BigIntId,
  batchNo: z.string().max(64).optional(),
  qty: Decimal,
  unitPrice: Decimal.optional(),
  expireAt: z.date().optional(),
});

export const UpdateLineInput = z.object({
  id: BigIntId,
  goodsId: BigIntId.optional(),
  locationId: BigIntId.optional(),
  batchNo: z.string().max(64).optional(),
  qty: Decimal.optional(),
  unitPrice: Decimal.optional(),
  expireAt: z.date().optional(),
});

export const RemoveLineInput = z.object({ id: BigIntId });

export const ListLinesInput = z.object({ inboundId: BigIntId });

export const TransitionInput = z.object({
  id: BigIntId,
  from: InboundStatus,
  to: InboundStatus,
  reason: z.string().max(256).optional(),
});

export const StatusActionInput = z.object({
  id: BigIntId,
  reason: z.string().max(256).optional(),
});

export const inboundContract = {
  list: { input: InboundListInput, output: InboundListOutput },
  detail: { input: IdParam, output: InboundWithLinesSchema },
  create: { input: InboundCreateInput, output: InboundWithLinesSchema },
  update: { input: InboundUpdateInput, output: InboundSchema },
  delete: { input: IdParam, output: OkResp },
  addLine: { input: AddLineInput, output: InboundLineSchema },
  updateLine: { input: UpdateLineInput, output: InboundLineSchema },
  removeLine: { input: RemoveLineInput, output: OkResp },
  listLines: { input: ListLinesInput, output: z.array(InboundLineSchema) },
  transition: { input: TransitionInput, output: InboundSchema },
  submit: { input: StatusActionInput, output: InboundSchema },
  audit: { input: StatusActionInput, output: InboundSchema },
  void: { input: StatusActionInput, output: InboundSchema },
  finish: { input: StatusActionInput, output: InboundSchema },
};
