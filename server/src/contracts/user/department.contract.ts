import { z } from 'zod';
import { BigIntId, IdParam, OkResp } from '../_shared';

export const DepartmentSchema = z.object({
  id: BigIntId,
  code: z.string(),
  name: z.string(),
  parentId: BigIntId.nullable(),
  path: z.string(),
  depth: z.number().int().nonnegative(),
  sort: z.number().int(),
  status: z.enum(['ACTIVE', 'DISABLED']),
  remark: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

export const DepartmentCreateInput = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  parentId: BigIntId.optional(),
  sort: z.number().int().default(0),
  remark: z.string().max(256).optional(),
});

export const DepartmentUpdateInput = z.object({
  id: BigIntId,
  name: z.string().min(1).max(128).optional(),
  sort: z.number().int().optional(),
  remark: z.string().max(256).optional(),
  version: z.number().int().nonnegative(),
});

export const departmentContract = {
  tree: { input: z.object({}).optional(), output: z.array(DepartmentSchema) },
  list: { input: z.object({ parentId: BigIntId.optional() }).optional(), output: z.array(DepartmentSchema) },
  detail: { input: IdParam, output: DepartmentSchema },
  create: { input: DepartmentCreateInput, output: DepartmentSchema },
  update: { input: DepartmentUpdateInput, output: DepartmentSchema },
  delete: { input: IdParam, output: OkResp },
  move: {
    input: z.object({ id: BigIntId, newParentId: BigIntId.optional() }),
    output: DepartmentSchema,
  },
};
