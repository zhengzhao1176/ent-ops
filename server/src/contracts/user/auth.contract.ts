import { z } from 'zod';
import { BigIntId } from '../_shared';

export const LoginInput = z.object({
  loginId: z.string().min(1).max(128),
  password: z.string().min(1).max(255),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export const LoginOutput = z.object({
  token: z.string(),
  refreshToken: z.string(),
  expiresAt: z.date(),
  user: z.object({
    id: BigIntId,
    username: z.string(),
    realName: z.string(),
    status: z.string(),
    mustChangePassword: z.boolean(),
  }),
});

export const RefreshInput = z.object({ refreshToken: z.string().min(1) });

export const ChangePasswordInput = z.object({
  oldPassword: z.string().min(1).max(255),
  newPassword: z.string().min(8).max(255),
  confirmPassword: z.string().min(1).max(255),
});

export const ForgotPasswordInput = z.object({
  loginId: z.string().min(1).max(128),
  channel: z.enum(['mobile', 'email']),
});

export const ResetPasswordInput = z.object({
  loginId: z.string().min(1).max(128),
  code: z.string().min(4).max(16),
  newPassword: z.string().min(8).max(255),
});

export const MeOutput = z.object({
  id: BigIntId,
  employeeNo: z.string(),
  username: z.string(),
  realName: z.string(),
  email: z.string(),
  mobile: z.string(),
  status: z.string(),
  mustChangePassword: z.boolean(),
  deptId: BigIntId,
  roles: z.array(z.object({ id: BigIntId, code: z.string(), name: z.string() })),
  permissions: z.array(z.string()),
});
