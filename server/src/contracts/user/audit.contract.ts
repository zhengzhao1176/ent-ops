import { z } from 'zod';
import { BigIntId, Pagination, PageResult } from '../_shared';

export const AuditLogSchema = z.object({
  id: BigIntId,
  operatorId: BigIntId.nullable(),
  operatorName: z.string().nullable(),
  ip: z.string().nullable(),
  actionType: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  result: z.enum(['SUCCESS', 'FAILURE']),
  message: z.string().nullable(),
  createdAt: z.date(),
});

export const AuditLogListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  operatorId: BigIntId.optional(),
  entity: z.string().max(64).optional(),
  actionType: z.string().max(64).optional(),
  result: z.enum(['SUCCESS', 'FAILURE']).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
});

export const auditContract = {
  list: { input: AuditLogListInput, output: PageResult(AuditLogSchema) },
};
