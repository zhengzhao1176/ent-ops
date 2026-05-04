import { TRPCError } from '@trpc/server';
import { runInTransaction } from '@/lib/tx';
import type { AppContext } from '../context';
import { deptRepo } from '../repositories/department.repo';
import { auditService } from './audit.service';

export const departmentService = {
  async create(ctx: AppContext, input: { code: string; name: string; parentId?: bigint; sort?: number; remark?: string }) {
    const existing = await deptRepo.findByCode(ctx.prisma, input.code);
    if (existing) throw new TRPCError({ code: 'CONFLICT', message: '部门编码已存在' });
    let parent = null as Awaited<ReturnType<typeof deptRepo.findById>>;
    if (input.parentId !== undefined) {
      parent = await deptRepo.findById(ctx.prisma, input.parentId);
      if (!parent) throw new TRPCError({ code: 'BAD_REQUEST', message: '父部门不存在' });
    }
    const path = parent ? `${parent.path}/${input.code}` : `/${input.code}`;
    const depth = parent ? parent.depth + 1 : 0;
    const created = await deptRepo.create(ctx.prisma, {
      code: input.code,
      name: input.name,
      parentId: input.parentId ?? null,
      path,
      depth,
      sort: input.sort ?? 0,
      status: 'ACTIVE',
      remark: input.remark ?? null,
      createdBy: ctx.user?.id ?? null,
    });
    await auditService.log(ctx, { entity: 'Department', entityId: created.id, actionType: 'CREATE', after: created });
    return created;
  },

  async update(ctx: AppContext, input: { id: bigint; version: number; name?: string; sort?: number; remark?: string }) {
    const before = await deptRepo.findById(ctx.prisma, input.id);
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: '部门不存在' });
    const count = await deptRepo.updateOptimistic(ctx.prisma, input.id, input.version, {
      name: input.name ?? undefined,
      sort: input.sort ?? undefined,
      remark: input.remark ?? undefined,
      updatedBy: ctx.user?.id ?? null,
    });
    if (count === 0) throw new TRPCError({ code: 'CONFLICT', message: '版本冲突' });
    const after = await deptRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, { entity: 'Department', entityId: input.id, actionType: 'UPDATE', before, after });
    return after!;
  },

  async move(ctx: AppContext, input: { id: bigint; newParentId?: bigint }) {
    const node = await deptRepo.findById(ctx.prisma, input.id);
    if (!node) throw new TRPCError({ code: 'NOT_FOUND', message: '部门不存在' });
    let newParent = null as Awaited<ReturnType<typeof deptRepo.findById>>;
    if (input.newParentId !== undefined) {
      newParent = await deptRepo.findById(ctx.prisma, input.newParentId);
      if (!newParent) throw new TRPCError({ code: 'BAD_REQUEST', message: '目标父部门不存在' });
      // Prevent moving into a descendant or self
      if (newParent.id === node.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不能将部门移动到自身' });
      }
      if (newParent.path === node.path || newParent.path.startsWith(node.path + '/')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不能将部门移动到其子部门下' });
      }
    }
    const oldPath = node.path;
    const newPath = newParent ? `${newParent.path}/${node.code}` : `/${node.code}`;
    const newDepth = newParent ? newParent.depth + 1 : 0;
    const descendants = await deptRepo.findDescendants(ctx.prisma, oldPath);

    await runInTransaction(ctx.prisma, async (tx) => {
      await tx.department.update({
        where: { id: node.id },
        data: { parentId: input.newParentId ?? null, path: newPath, depth: newDepth, updatedBy: ctx.user?.id ?? null },
      });
      for (const d of descendants) {
        const tail = d.path.slice(oldPath.length); // includes leading '/'
        const updatedPath = newPath + tail;
        const updatedDepth = newDepth + (tail.split('/').filter(Boolean).length);
        await tx.department.update({
          where: { id: d.id },
          data: { path: updatedPath, depth: updatedDepth },
        });
      }
    });
    const fresh = await deptRepo.findById(ctx.prisma, node.id);
    await auditService.log(ctx, { entity: 'Department', entityId: node.id, actionType: 'MOVE', before: { parentId: node.parentId, path: oldPath }, after: { parentId: input.newParentId ?? null, path: newPath } });
    return fresh!;
  },

  async softDelete(ctx: AppContext, id: bigint) {
    const d = await deptRepo.findById(ctx.prisma, id);
    if (!d) throw new TRPCError({ code: 'NOT_FOUND', message: '部门不存在' });
    const childCount = (await deptRepo.findChildren(ctx.prisma, id)).length;
    if (childCount > 0) throw new TRPCError({ code: 'CONFLICT', message: '存在子部门，不可删除' });
    const userCount = await deptRepo.countUsers(ctx.prisma, id);
    if (userCount > 0) throw new TRPCError({ code: 'CONFLICT', message: '部门下还有用户' });
    await deptRepo.softDelete(ctx.prisma, id);
    await auditService.log(ctx, { entity: 'Department', entityId: id, actionType: 'DELETE', before: d });
    return { ok: true as const };
  },
};
