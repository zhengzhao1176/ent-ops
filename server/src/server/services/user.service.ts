import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import { userRepo } from '../repositories/user.repo';
import { passwordHistoryRepo } from '../repositories/passwordHistory.repo';
import { auditService } from './audit.service';
import { generateInitialPassword, hashPassword } from './password.service';

function publicView(u: Awaited<ReturnType<typeof userRepo.findById>>) {
  if (!u) return u;
  const { passwordHash, ...rest } = u;
  return rest;
}

export const userService = {
  async create(
    ctx: AppContext,
    input: {
      employeeNo: string;
      username: string;
      realName: string;
      mobile: string;
      email: string;
      deptId: bigint;
      initialPassword?: string;
      remark?: string;
    },
  ) {
    const dup = await ctx.prisma.user.findFirst({
      where: {
        OR: [{ employeeNo: input.employeeNo }, { username: input.username }, { mobile: input.mobile }, { email: input.email }],
      },
    });
    if (dup) {
      let field = 'duplicate';
      if (dup.employeeNo === input.employeeNo) field = 'employeeNo';
      else if (dup.username === input.username) field = 'username';
      else if (dup.mobile === input.mobile) field = 'mobile';
      else if (dup.email === input.email) field = 'email';
      throw new TRPCError({ code: 'CONFLICT', message: `字段重复: ${field}` });
    }
    const dept = await ctx.prisma.department.findUnique({ where: { id: input.deptId } });
    if (!dept) throw new TRPCError({ code: 'BAD_REQUEST', message: '部门不存在' });

    const initialPassword = input.initialPassword ?? generateInitialPassword();
    const passwordHash = await hashPassword(initialPassword);

    const user = await ctx.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          employeeNo: input.employeeNo,
          username: input.username,
          realName: input.realName,
          mobile: input.mobile,
          email: input.email,
          passwordHash,
          deptId: input.deptId,
          status: 'PENDING',
          mustChangePassword: true,
          remark: input.remark,
        },
      });
      await passwordHistoryRepo.append(tx, u.id, passwordHash);
      await tx.user.update({ where: { id: u.id }, data: { status: 'ACTIVE', createdBy: ctx.user?.id ?? null } });
      return u;
    });
    await auditService.log(ctx, {
      entity: 'User', entityId: user.id, actionType: 'CREATE',
      after: { id: user.id, username: user.username, employeeNo: user.employeeNo },
    });
    const fresh = await userRepo.findByIdRequired(ctx.prisma, user.id);
    return publicView(fresh)!;
  },

  async update(
    ctx: AppContext,
    input: {
      id: bigint;
      version: number;
      realName?: string;
      mobile?: string;
      email?: string;
      deptId?: bigint;
      nickname?: string;
      avatar?: string;
      remark?: string;
    },
  ) {
    const u = await userRepo.findById(ctx.prisma, input.id);
    if (!u) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

    if (input.mobile && input.mobile !== u.mobile) {
      const d = await ctx.prisma.user.findFirst({ where: { mobile: input.mobile, NOT: { id: u.id } } });
      if (d) throw new TRPCError({ code: 'CONFLICT', message: '字段重复: mobile' });
    }
    if (input.email && input.email !== u.email) {
      const d = await ctx.prisma.user.findFirst({ where: { email: input.email, NOT: { id: u.id } } });
      if (d) throw new TRPCError({ code: 'CONFLICT', message: '字段重复: email' });
    }

    const before = { ...u };
    const updateData: Prisma.UserUncheckedUpdateInput = {
      realName: input.realName ?? undefined,
      mobile: input.mobile ?? undefined,
      email: input.email ?? undefined,
      deptId: input.deptId ?? undefined,
      nickname: input.nickname ?? undefined,
      avatar: input.avatar ?? undefined,
      remark: input.remark ?? undefined,
      updatedBy: ctx.user?.id ?? undefined,
    };
    const count = await userRepo.updateOptimistic(ctx.prisma, input.id, input.version, updateData as Prisma.UserUpdateInput);
    if (count === 0) {
      throw new TRPCError({ code: 'CONFLICT', message: '版本冲突或记录不存在' });
    }
    const fresh = await userRepo.findByIdRequired(ctx.prisma, input.id);
    await auditService.log(ctx, {
      entity: 'User', entityId: fresh.id, actionType: 'UPDATE',
      before, after: fresh,
    });
    return publicView(fresh)!;
  },

  async list(
    ctx: AppContext,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      status?: string;
      deptId?: bigint;
    },
  ) {
    const r = await userRepo.findPage(ctx.prisma, input);
    return { ...r, items: r.items.map((i) => publicView(i)!) };
  },

  async detail(ctx: AppContext, id: bigint) {
    const u = await userRepo.findById(ctx.prisma, id);
    if (!u) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
    return publicView(u)!;
  },

  async softDelete(ctx: AppContext, id: bigint) {
    const u = await userRepo.findById(ctx.prisma, id);
    if (!u) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
    const isSuper = await userRepo.hasSuperAdminRole(ctx.prisma, id);
    if (isSuper) {
      const remaining = await userRepo.countSuperAdmins(ctx.prisma);
      if (remaining <= 1) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'AT_LEAST_ONE_SUPER_ADMIN' });
      }
    }
    await ctx.prisma.user.update({
      where: { id },
      data: { deletedAt: ctx.clock.now(), updatedBy: ctx.user?.id ?? null },
    });
    await auditService.log(ctx, {
      entity: 'User', entityId: id, actionType: 'DELETE',
      before: u, after: { deletedAt: ctx.clock.now() },
    });
    return { ok: true as const };
  },

  async restore(ctx: AppContext, id: bigint) {
    const u = await ctx.prisma.user.findUnique({ where: { id } });
    if (!u || !u.deletedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: '记录未删除' });
    await ctx.prisma.user.update({ where: { id }, data: { deletedAt: null, updatedBy: ctx.user?.id ?? null } });
    const fresh = await userRepo.findByIdRequired(ctx.prisma, id);
    await auditService.log(ctx, { entity: 'User', entityId: id, actionType: 'RESTORE', after: fresh });
    return publicView(fresh)!;
  },

  async setStatus(
    ctx: AppContext,
    id: bigint,
    target: 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'PENDING',
    options?: { allowSuperAdminTarget?: boolean },
  ) {
    const u = await userRepo.findById(ctx.prisma, id);
    if (!u) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

    if (target === 'DISABLED' && !options?.allowSuperAdminTarget) {
      const isSuper = await userRepo.hasSuperAdminRole(ctx.prisma, id);
      if (isSuper) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'SUPER_ADMIN_PROTECTED' });
      }
    }

    const data: Prisma.UserUpdateInput = { status: target, updatedBy: ctx.user?.id ?? null };
    if (target === 'ACTIVE') {
      data.lockedUntil = null;
      data.loginFailCount = 0;
    }
    await ctx.prisma.user.update({ where: { id }, data });
    const fresh = await userRepo.findByIdRequired(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'User', entityId: id, actionType: `STATUS_${target}`,
      before: { status: u.status }, after: { status: target },
    });
    return publicView(fresh)!;
  },

  async resetPasswordByAdmin(ctx: AppContext, userId: bigint) {
    const u = await userRepo.findById(ctx.prisma, userId);
    if (!u) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
    const initialPassword = generateInitialPassword();
    const passwordHash = await hashPassword(initialPassword);
    await ctx.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordUpdatedAt: ctx.clock.now(),
          updatedBy: ctx.user?.id ?? null,
        },
      });
      await passwordHistoryRepo.append(tx, userId, passwordHash);
    });
    await auditService.log(ctx, {
      entity: 'User', entityId: userId, actionType: 'RESET_PASSWORD',
      after: { mustChangePassword: true },
    });
    return { ok: true as const, initialPassword };
  },

  async assignRoles(ctx: AppContext, userId: bigint, roleIds: bigint[]) {
    const u = await userRepo.findById(ctx.prisma, userId);
    if (!u) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
    const wasSuper = await userRepo.hasSuperAdminRole(ctx.prisma, userId);
    const roles = await ctx.prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '存在无效角色' });
    }
    const willBeSuper = roles.some((r) => r.code === 'ROLE_SUPER_ADMIN');
    if (wasSuper && !willBeSuper) {
      const remaining = await userRepo.countSuperAdmins(ctx.prisma);
      if (remaining <= 1) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'AT_LEAST_ONE_SUPER_ADMIN' });
      }
    }
    await ctx.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length) {
        await tx.userRole.createMany({
          data: roleIds.map((rid) => ({ userId, roleId: rid })),
        });
      }
    });
    await auditService.log(ctx, {
      entity: 'User', entityId: userId, actionType: 'ASSIGN_ROLES',
      after: { roleIds: roleIds.map(String) },
    });
    return { ok: true as const };
  },
};
