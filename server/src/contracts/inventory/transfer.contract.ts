import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const TransferKind = z.enum(['INTERNAL', 'RETURN', 'ADJUSTMENT']);

// State machine: 10=draft 20=submitted 25=audited 30=received 40=finished 90=void
export const TransferStatus = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(25),
  z.literal(30),
  z.literal(40),
  z.literal(90),
]);

export const TransferLineSchema = z.object({
  id: BigIntId,
  transferId: BigIntId,
  goodsId: BigIntId,
  batchNo: z.string().nullable(),
  qty: Decimal,
  shippedQty: Decimal.nullable(),
  receivedQty: Decimal.nullable(),
});

export const TransferSchema = z.object({
  id: BigIntId,
  docNo: z.string(),
  kind: TransferKind,
  fromWarehouseId: BigIntId,
  fromLocationId: BigIntId,
  toWarehouseId: BigIntId,
  toLocationId: BigIntId,
  applicantId: BigIntId.nullable(),
  operatorId: BigIntId,
  operationAt: z.date(),
  reason: z.string().nullable(),
  remark: z.string().nullable(),
  status: TransferStatus,
  statusUpdatedAt: z.date().nullable(),
  statusUpdatedBy: BigIntId.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

export const TransferWithLinesSchema = TransferSchema.extend({
  lines: z.array(TransferLineSchema),
});

const docNo = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);

export const TransferLineCreateInput = z.object({
  goodsId: BigIntId,
  batchNo: z.string().max(64).optional(),
  qty: Decimal,
  shippedQty: Decimal.optional(),
  receivedQty: Decimal.optional(),
});

export const TransferCreateInput = z.object({
  docNo: docNo.optional(),
  kind: TransferKind,
  fromWarehouseId: BigIntId,
  fromLocationId: BigIntId,
  toWarehouseId: BigIntId,
  toLocationId: BigIntId,
  applicantId: BigIntId.optional(),
  operatorId: BigIntId,
  operationAt: z.date(),
  reason: z.string().max(256).optional(),
  remark: z.string().max(256).optional(),
  lines: z.array(TransferLineCreateInput).min(0),
});

export const TransferUpdateInput = z.object({
  id: BigIntId,
  kind: TransferKind.optional(),
  fromWarehouseId: BigIntId.optional(),
  fromLocationId: BigIntId.optional(),
  toWarehouseId: BigIntId.optional(),
  toLocationId: BigIntId.optional(),
  applicantId: BigIntId.optional(),
  operatorId: BigIntId.optional(),
  operationAt: z.date().optional(),
  reason: z.string().max(256).optional(),
  remark: z.string().max(256).optional(),
  version: z.number().int().nonnegative(),
});

export const TransferListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  kind: TransferKind.optional(),
  fromWarehouseId: BigIntId.optional(),
  toWarehouseId: BigIntId.optional(),
  status: TransferStatus.optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  sort: SortInput,
});

export const TransferListOutput = PageResult(TransferSchema);

export const AddLineInput = z.object({
  transferId: BigIntId,
  goodsId: BigIntId,
  batchNo: z.string().max(64).optional(),
  qty: Decimal,
  shippedQty: Decimal.optional(),
  receivedQty: Decimal.optional(),
});

export const UpdateLineInput = z.object({
  id: BigIntId,
  goodsId: BigIntId.optional(),
  batchNo: z.string().max(64).optional(),
  qty: Decimal.optional(),
  shippedQty: Decimal.optional(),
  receivedQty: Decimal.optional(),
});

export const RemoveLineInput = z.object({ id: BigIntId });

export const ListLinesInput = z.object({ transferId: BigIntId });

export const TransitionInput = z.object({
  id: BigIntId,
  from: TransferStatus,
  to: TransferStatus,
  reason: z.string().max(256).optional(),
});

export const StatusActionInput = z.object({
  id: BigIntId,
  reason: z.string().max(256).optional(),
});

export const transferContract = {
  list: { input: TransferListInput, output: TransferListOutput },
  detail: { input: IdParam, output: TransferWithLinesSchema },
  create: { input: TransferCreateInput, output: TransferWithLinesSchema },
  update: { input: TransferUpdateInput, output: TransferSchema },
  delete: { input: IdParam, output: OkResp },
  addLine: { input: AddLineInput, output: TransferLineSchema },
  updateLine: { input: UpdateLineInput, output: TransferLineSchema },
  removeLine: { input: RemoveLineInput, output: OkResp },
  listLines: { input: ListLinesInput, output: z.array(TransferLineSchema) },
  transition: { input: TransitionInput, output: TransferSchema },
  submit: { input: StatusActionInput, output: TransferSchema },
  audit: { input: StatusActionInput, output: TransferSchema },
  receive: { input: StatusActionInput, output: TransferSchema },
  finish: { input: StatusActionInput, output: TransferSchema },
  void: { input: StatusActionInput, output: TransferSchema },
};
