import { TRPCError } from '@trpc/server';
import { runInTransaction } from '@/lib/tx';
import type { AppContext } from '../context';
import { userRepo } from '../repositories/user.repo';
import { passwordHistoryRepo } from '../repositories/passwordHistory.repo';
import { loginAttemptRepo } from '../repositories/loginAttempt.repo';
import { permissionRepo } from '../repositories/permission.repo';
import { sessionService } from './session.service';
import { auditService } from './audit.service';
import { computeLockState } from './lockPolicy.service';
import { checkStrength, hashPassword, verifyPassword } from './password.service';

export const authService = {
  async login(ctx: AppContext, input: { loginId: string; password: string }) {
    const ip = ctx.ip ?? '0.0.0.0';
    const user = await userRepo.findByLoginId(ctx.prisma, input.loginId);
    if (!user) {
      await loginAttemptRepo.log(ctx.prisma, {
        loginId: input.loginId, ip, success: false, reason: 'NO_SUCH_USER',
      });
      throw new TRPCError({ code: 'UNAUTHORIZED', message: '账号或密码错误' });
    }

    // Auto-unlock if lockedUntil expired
    const now = ctx.clock.now();
    const lockState = computeLockState({
      failCount: user.loginFailCount,
      now,
      currentLockedUntil: user.lockedUntil,
    });

    if (lockState.shouldLock && !lockState.autoUnlock) {
      await loginAttemptRepo.log(ctx.prisma, {
        loginId: input.loginId, ip, success: false, userId: user.id, reason: 'LOCKED',
      });
      throw new TRPCError({ code: 'FORBIDDEN', message: 'LOCKED' });
    }

    if (user.status === 'DISABLED') {
      await loginAttemptRepo.log(ctx.prisma, {
        loginId: input.loginId, ip, success: false, userId: user.id, reason: 'DISABLED',
      });
      throw new TRPCError({ code: 'FORBIDDEN', message: 'DISABLED' });
    }
    if (user.status === 'PENDING') {
      await loginAttemptRepo.log(ctx.prisma, {
        loginId: input.loginId, ip, success: false, userId: user.id, reason: 'PENDING',
      });
      throw new TRPCError({ code: 'FORBIDDEN', message: 'PENDING' });
    }
    if (user.status === 'DELETED' || user.deletedAt) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: '账号或密码错误' });
    }

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      const newFail = user.loginFailCount + 1;
      const newLock = computeLockState({ failCount: newFail, now });
      await userRepo.incrementLoginFail(ctx.prisma, user.id, newLock.lockedUntil);
      await loginAttemptRepo.log(ctx.prisma, {
        loginId: input.loginId, ip, success: false, userId: user.id, reason: 'BAD_PASSWORD',
      });
      throw new TRPCError({ code: 'UNAUTHORIZED', message: '账号或密码错误' });
    }

    // Success: reset fail counter, write LoginAttempt success, issue session
    await userRepo.resetLoginFail(ctx.prisma, user.id, now, ctx.ip);
    await loginAttemptRepo.log(ctx.prisma, {
      loginId: input.loginId, ip, success: true, userId: user.id,
    });
    const session = await sessionService.issue(ctx, user.id);
    return {
      token: session.token,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        status: 'ACTIVE',
        mustChangePassword: user.mustChangePassword,
      },
    };
  },

  async changePassword(
    ctx: AppContext,
    userId: bigint,
    input: { oldPassword: string; newPassword: string; confirmPassword: string },
  ) {
    if (input.newPassword !== input.confirmPassword) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '两次输入的新密码不一致' });
    }
    const strength = checkStrength(input.newPassword);
    if (!strength.ok) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: strength.reason === 'LENGTH' ? '密码长度不符合要求' : '密码复杂度不符合要求',
      });
    }
    const user = await userRepo.findByIdRequired(ctx.prisma, userId);
    const ok = await verifyPassword(input.oldPassword, user.passwordHash);
    if (!ok) throw new TRPCError({ code: 'UNAUTHORIZED', message: '原密码错误' });

    // Check against last 3
    const history = await passwordHistoryRepo.recent(ctx.prisma, userId, 3);
    for (const h of history) {
      if (await verifyPassword(input.newPassword, h.passwordHash)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '新密码不能与最近 3 次相同' });
      }
    }
    if (await verifyPassword(input.newPassword, user.passwordHash)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '新密码不能与最近 3 次相同' });
    }

    const newHash = await hashPassword(input.newPassword);
    await runInTransaction(ctx.prisma, async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: newHash,
          mustChangePassword: false,
          passwordUpdatedAt: ctx.clock.now(),
        },
      });
      await passwordHistoryRepo.append(tx, userId, newHash);
    });
    await auditService.log(ctx, {
      entity: 'User',
      entityId: userId,
      actionType: 'CHANGE_PASSWORD',
      after: { mustChangePassword: false },
    });
    return { ok: true as const };
  },

  async me(ctx: AppContext) {
    const u = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.user!.id },
      include: { roles: { include: { role: true } } },
    });
    const perms = await permissionRepo.listForUser(ctx.prisma, u.id);
    return {
      id: u.id,
      employeeNo: u.employeeNo,
      username: u.username,
      realName: u.realName,
      email: u.email,
      mobile: u.mobile,
      status: u.status,
      mustChangePassword: u.mustChangePassword,
      deptId: u.deptId,
      roles: u.roles.map((r) => ({ id: r.role.id, code: r.role.code, name: r.role.name })),
      permissions: perms,
    };
  },
};
