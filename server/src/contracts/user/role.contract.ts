import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

export const RoleSchema = z.object({
  id: BigIntId,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isBuiltin: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

export const RoleCreateInput = z.object({
  code: z.string().min(2).max(64).regex(/^ROLE_[A-Z0-9_]+$/, '角色编码须以 ROLE_ 开头'),
  name: z.string().min(1).max(128),
  description: z.string().max(256).optional(),
});

export const RoleUpdateInput = z.object({
  id: BigIntId,
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(256).optional(),
  version: z.number().int().nonnegative(),
});

export const RoleListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  isBuiltin: z.boolean().optional(),
  sort: SortInput,
});

export const AssignPermsInput = z.object({
  roleId: BigIntId,
  permissionIds: z.array(BigIntId).min(0).max(500),
});

export const roleContract = {
  list: { input: RoleListInput, output: PageResult(RoleSchema) },
  detail: { input: IdParam, output: RoleSchema },
  create: { input: RoleCreateInput, output: RoleSchema },
  update: { input: RoleUpdateInput, output: RoleSchema },
  delete: { input: IdParam, output: OkResp },
  restore: { input: IdParam, output: RoleSchema },
  assignPermissions: { input: AssignPermsInput, output: OkResp },
  listUsers: {
    input: z.object({ roleId: BigIntId, page: Pagination.shape.page, pageSize: Pagination.shape.pageSize }),
    output: z.object({
      total: z.number(),
      items: z.array(z.object({ id: BigIntId, username: z.string(), realName: z.string() })),
    }),
  },
};
