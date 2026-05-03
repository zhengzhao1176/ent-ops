import { z } from 'zod';
import { BigIntId, IdParam, OkResp, Pagination, PageResult, SortInput } from '../_shared';

export const UserStatus = z.enum(['PENDING', 'ACTIVE', 'DISABLED', 'LOCKED', 'DELETED']);

export const UserSchema = z.object({
  id: BigIntId,
  employeeNo: z.string(),
  username: z.string(),
  realName: z.string(),
  mobile: z.string(),
  email: z.string(),
  deptId: BigIntId,
  status: UserStatus,
  loginFailCount: z.number().int().nonnegative(),
  lockedUntil: z.date().nullable(),
  lastLoginAt: z.date().nullable(),
  lastLoginIp: z.string().nullable(),
  passwordUpdatedAt: z.date().nullable(),
  mustChangePassword: z.boolean(),
  avatar: z.string().nullable(),
  nickname: z.string().nullable(),
  remark: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().nonnegative(),
});

const employeeNo = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);
const username = z.string().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/);
const mobile = z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确');
const email = z.string().email().max(128);
const realName = z.string().min(1).max(64);

export const UserCreateInput = z.object({
  employeeNo,
  username,
  realName,
  mobile,
  email,
  deptId: BigIntId,
  initialPassword: z.string().min(8).max(255).optional(),
  remark: z.string().max(256).optional(),
});

export const UserUpdateInput = z.object({
  id: BigIntId,
  realName: realName.optional(),
  mobile: mobile.optional(),
  email: email.optional(),
  deptId: BigIntId.optional(),
  nickname: z.string().max(64).optional(),
  avatar: z.string().max(512).optional(),
  remark: z.string().max(256).optional(),
  version: z.number().int().nonnegative(),
});

export const UserListInput = z.object({
  page: Pagination.shape.page,
  pageSize: Pagination.shape.pageSize,
  keyword: z.string().max(128).optional(),
  status: UserStatus.optional(),
  deptId: BigIntId.optional(),
  sort: SortInput,
});

export const UserListOutput = PageResult(UserSchema);

export const AssignRolesInput = z.object({
  userId: BigIntId,
  roleIds: z.array(BigIntId).min(0).max(20),
});

export const ResetPasswordByAdminInput = z.object({ userId: BigIntId });
export const ResetPasswordByAdminOutput = z.object({
  ok: z.literal(true),
  initialPassword: z.string(),
});

export const StatusActionInput = z.object({ id: BigIntId, reason: z.string().max(256).optional() });

export const userContract = {
  list: { input: UserListInput, output: UserListOutput },
  detail: { input: IdParam, output: UserSchema },
  create: { input: UserCreateInput, output: UserSchema },
  update: { input: UserUpdateInput, output: UserSchema },
  delete: { input: IdParam, output: OkResp },
  restore: { input: IdParam, output: UserSchema },
  activate: { input: StatusActionInput, output: UserSchema },
  deactivate: { input: StatusActionInput, output: UserSchema },
  lock: { input: StatusActionInput, output: UserSchema },
  unlock: { input: StatusActionInput, output: UserSchema },
  resetPassword: { input: ResetPasswordByAdminInput, output: ResetPasswordByAdminOutput },
  assignRoles: { input: AssignRolesInput, output: OkResp },
};
