import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const OutboundKind = z.enum(['SALES', 'USE', 'TRANSFER', 'STOCKTAKE', 'DAMAGE', 'OTHER']);
export const PickStrategy = z.enum(['FIFO', 'FEFO', 'MANUAL']);

// State machine: 10=draft 20=submitted 25=audited 30=shipped 40=finished 90=void
export const OutboundStatus = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(25),
  z.literal(30),
  z.literal(40),
  z.literal(90),
]);

export const OutboundLineSchema = z.object({
  id: BigIntId,
  outboundId: BigIntId,
  goodsId: BigIntId,
  locationId: BigIntId,
  batchNo: z.string(),
  qty: Decimal,
});

export const OutboundSchema = z.object({
  id: BigIntId,
  docNo: z.string(),
  kind: OutboundKind,
  targetDocNo: z.string().nullable(),
  warehouseId: BigIntId,
  applicantId: BigIntId.nullable(),
  operatorId: BigIntId,
  operationAt: z.date(),
  pickStrategy: PickStrategy,
  remark: z.string().nullable(),
  status: OutboundStatus,
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

export const OutboundWithLinesSchema = OutboundSchema.extend({
  lines: z.array(OutboundLineSchema),
});

const docNo = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);

export const OutboundLineCreateInput = z.object({
  goodsId: BigIntId,
  locationId: BigIntId,
  batchNo: z.string().max(64).optional(),
  qty: Decimal,
});

export const OutboundCreateInput = z.object({
  docNo: docNo.optional(),
  kind: OutboundKind,
  targetDocNo: z.string().max(64).optional(),
  warehouseId: BigIntId,
  applicantId: BigIntId.optional(),
  operatorId: BigIntId,
  operationAt: z.date(),
  pickStrategy: PickStrategy.default('FIFO'),
  remark: z.string().max(256).optional(),
  lines: z.array(OutboundLineCreateInput).min(0),
});

export const OutboundUpdateInput = z.object({
  id: BigIntId,
  kind: OutboundKind.optional(),
  targetDocNo: z.string().max(64).optional(),
  warehouseId: BigIntId.optional(),
  applicantId: BigIntId.optional(),
  operatorId: BigIntId.optional(),
  operationAt: z.date().optional(),
  pickStrategy: PickStrategy.optional(),
  remark: z.string().max(256).optional(),
  version: z.number().int().nonnegative(),
});

export const OutboundListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  kind: OutboundKind.optional(),
  warehouseId: BigIntId.optional(),
  status: OutboundStatus.optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  sort: SortInput,
});

export const OutboundListOutput = PageResult(OutboundSchema);

export const AddLineInput = z.object({
  outboundId: BigIntId,
  goodsId: BigIntId,
  locationId: BigIntId,
  batchNo: z.string().max(64).optional(),
  qty: Decimal,
});

export const UpdateLineInput = z.object({
  id: BigIntId,
  goodsId: BigIntId.optional(),
  locationId: BigIntId.optional(),
  batchNo: z.string().max(64).optional(),
  qty: Decimal.optional(),
});

export const RemoveLineInput = z.object({ id: BigIntId });

export const ListLinesInput = z.object({ outboundId: BigIntId });

export const TransitionInput = z.object({
  id: BigIntId,
  from: OutboundStatus,
  to: OutboundStatus,
  reason: z.string().max(256).optional(),
});

export const StatusActionInput = z.object({
  id: BigIntId,
  reason: z.string().max(256).optional(),
});

export const outboundContract = {
  list: { input: OutboundListInput, output: OutboundListOutput },
  detail: { input: IdParam, output: OutboundWithLinesSchema },
  create: { input: OutboundCreateInput, output: OutboundWithLinesSchema },
  update: { input: OutboundUpdateInput, output: OutboundSchema },
  delete: { input: IdParam, output: OkResp },
  addLine: { input: AddLineInput, output: OutboundLineSchema },
  updateLine: { input: UpdateLineInput, output: OutboundLineSchema },
  removeLine: { input: RemoveLineInput, output: OkResp },
  listLines: { input: ListLinesInput, output: z.array(OutboundLineSchema) },
  transition: { input: TransitionInput, output: OutboundSchema },
  submit: { input: StatusActionInput, output: OutboundSchema },
  audit: { input: StatusActionInput, output: OutboundSchema },
  ship: { input: StatusActionInput, output: OutboundSchema },
  finish: { input: StatusActionInput, output: OutboundSchema },
  void: { input: StatusActionInput, output: OutboundSchema },
};
