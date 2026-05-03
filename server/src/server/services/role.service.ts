import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import { roleRepo } from '../repositories/role.repo';
import { auditService } from './audit.service';

export const roleService = {
  async create(ctx: AppContext, input: { code: string; name: string; description?: string }) {
    const existing = await roleRepo.findByCode(ctx.prisma, input.code);
    if (existing) throw new TRPCError({ code: 'CONFLICT', message: '角色编码已存在' });
    const r = await roleRepo.create(ctx.prisma, {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      isBuiltin: false,
      createdBy: ctx.user?.id ?? null,
    });
    await auditService.log(ctx, { entity: 'Role', entityId: r.id, actionType: 'CREATE', after: r });
    return r;
  },

  async update(ctx: AppContext, input: { id: bigint; version: number; name?: string; description?: string }) {
    const before = await roleRepo.findById(ctx.prisma, input.id);
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: '角色不存在' });
    const count = await roleRepo.updateOptimistic(ctx.prisma, input.id, input.version, {
      name: input.name ?? undefined,
      description: input.description ?? undefined,
      updatedBy: ctx.user?.id ?? null,
    });
    if (count === 0) throw new TRPCError({ code: 'CONFLICT', message: '版本冲突' });
    const after = await roleRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, { entity: 'Role', entityId: input.id, actionType: 'UPDATE', before, after });
    return after!;
  },

  async softDelete(ctx: AppContext, id: bigint) {
    const r = await roleRepo.findById(ctx.prisma, id);
    if (!r) throw new TRPCError({ code: 'NOT_FOUND', message: '角色不存在' });
    if (r.isBuiltin) throw new TRPCError({ code: 'FORBIDDEN', message: '内置角色不可删除' });
    const userCount = await roleRepo.countUsers(ctx.prisma, id);
    if (userCount > 0) throw new TRPCError({ code: 'CONFLICT', message: '存在用户绑定该角色' });
    await roleRepo.softDelete(ctx.prisma, id);
    await auditService.log(ctx, { entity: 'Role', entityId: id, actionType: 'DELETE', before: r });
    return { ok: true as const };
  },

  async assignPermissions(ctx: AppContext, roleId: bigint, permissionIds: bigint[]) {
    const r = await roleRepo.findById(ctx.prisma, roleId);
    if (!r) throw new TRPCError({ code: 'NOT_FOUND', message: '角色不存在' });
    if (permissionIds.length) {
      const existing = await ctx.prisma.permission.findMany({ where: { id: { in: permissionIds } } });
      if (existing.length !== permissionIds.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '存在无效权限' });
      }
    }
    await roleRepo.setPermissions(ctx.prisma, roleId, permissionIds);
    await auditService.log(ctx, { entity: 'Role', entityId: roleId, actionType: 'ASSIGN_PERMS', after: { permissionIds: permissionIds.map(String) } });
    return { ok: true as const };
  },
};
