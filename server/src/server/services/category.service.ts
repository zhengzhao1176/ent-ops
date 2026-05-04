import { TRPCError } from '@trpc/server';
import { runInTransaction } from '@/lib/tx';
import type { AppContext } from '../context';
import { categoryRepo } from '../repositories/category.repo';
import { auditService } from './audit.service';

export const categoryService = {
  async create(
    ctx: AppContext,
    input: { code: string; name: string; parentId?: bigint; sort?: number },
  ) {
    const existing = await categoryRepo.findByCode(ctx.prisma, input.code);
    if (existing) throw new TRPCError({ code: 'CONFLICT', message: '分类编码已存在' });
    let parent = null as Awaited<ReturnType<typeof categoryRepo.findById>>;
    if (input.parentId !== undefined) {
      parent = await categoryRepo.findById(ctx.prisma, input.parentId);
      if (!parent) throw new TRPCError({ code: 'BAD_REQUEST', message: '父分类不存在' });
    }
    const path = parent ? `${parent.path}/${input.code}` : `/${input.code}`;
    const depth = parent ? parent.depth + 1 : 0;
    const created = await categoryRepo.create(ctx.prisma, {
      code: input.code,
      name: input.name,
      parentId: input.parentId ?? null,
      path,
      depth,
      sort: input.sort ?? 0,
      status: 'ACTIVE',
    });
    await auditService.log(ctx, {
      entity: 'Category', entityId: created.id, actionType: 'CREATE', after: created,
    });
    return created;
  },

  async update(
    ctx: AppContext,
    input: {
      id: bigint;
      version: number;
      name?: string;
      sort?: number;
      status?: 'ACTIVE' | 'DISABLED';
    },
  ) {
    const before = await categoryRepo.findById(ctx.prisma, input.id);
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
    const count = await categoryRepo.updateOptimistic(ctx.prisma, input.id, input.version, {
      name: input.name ?? undefined,
      sort: input.sort ?? undefined,
      status: input.status ?? undefined,
    });
    if (count === 0) throw new TRPCError({ code: 'CONFLICT', message: '版本冲突' });
    const after = await categoryRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, {
      entity: 'Category', entityId: input.id, actionType: 'UPDATE', before, after,
    });
    return after!;
  },

  async tree(ctx: AppContext) {
    return categoryRepo.tree(ctx.prisma);
  },

  async list(
    ctx: AppContext,
    input?: { parentId?: bigint; status?: string; keyword?: string },
  ) {
    return categoryRepo.list(ctx.prisma, input);
  },

  async detail(ctx: AppContext, id: bigint) {
    const c = await categoryRepo.findById(ctx.prisma, id);
    if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
    return c;
  },

  async listChildren(ctx: AppContext, parentId?: bigint) {
    return categoryRepo.findChildren(ctx.prisma, parentId ?? null);
  },

  async listAncestors(ctx: AppContext, id: bigint) {
    const c = await categoryRepo.findById(ctx.prisma, id);
    if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
    return categoryRepo.findAncestorsByPath(ctx.prisma, c.path);
  },

  async move(ctx: AppContext, input: { id: bigint; newParentId?: bigint }) {
    const node = await categoryRepo.findById(ctx.prisma, input.id);
    if (!node) throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
    let newParent = null as Awaited<ReturnType<typeof categoryRepo.findById>>;
    if (input.newParentId !== undefined) {
      newParent = await categoryRepo.findById(ctx.prisma, input.newParentId);
      if (!newParent) throw new TRPCError({ code: 'BAD_REQUEST', message: '目标父分类不存在' });
      if (newParent.id === node.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不能将分类移动到自身' });
      }
      if (newParent.path === node.path || newParent.path.startsWith(node.path + '/')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不能将分类移动到其子分类下' });
      }
    }
    const oldPath = node.path;
    const newPath = newParent ? `${newParent.path}/${node.code}` : `/${node.code}`;
    const newDepth = newParent ? newParent.depth + 1 : 0;
    const descendants = await categoryRepo.findDescendants(ctx.prisma, oldPath);

    await runInTransaction(ctx.prisma, async (tx) => {
      await tx.category.update({
        where: { id: node.id },
        data: {
          parentId: input.newParentId ?? null,
          path: newPath,
          depth: newDepth,
        },
      });
      for (const d of descendants) {
        const tail = d.path.slice(oldPath.length); // includes leading '/'
        const updatedPath = newPath + tail;
        const updatedDepth = newDepth + tail.split('/').filter(Boolean).length;
        await tx.category.update({
          where: { id: d.id },
          data: { path: updatedPath, depth: updatedDepth },
        });
      }
    });
    const fresh = await categoryRepo.findById(ctx.prisma, node.id);
    await auditService.log(ctx, {
      entity: 'Category', entityId: node.id, actionType: 'MOVE',
      before: { parentId: node.parentId, path: oldPath },
      after: { parentId: input.newParentId ?? null, path: newPath },
    });
    return fresh!;
  },

  async softDelete(ctx: AppContext, id: bigint) {
    const c = await categoryRepo.findById(ctx.prisma, id);
    if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
    const childCount = (await categoryRepo.findChildren(ctx.prisma, id)).length;
    if (childCount > 0) throw new TRPCError({ code: 'CONFLICT', message: '存在子分类，不可删除' });
    const goodsCount = await categoryRepo.countGoods(ctx.prisma, id);
    if (goodsCount > 0) throw new TRPCError({ code: 'CONFLICT', message: '分类下还有商品' });
    await categoryRepo.softDelete(ctx.prisma, id);
    await auditService.log(ctx, { entity: 'Category', entityId: id, actionType: 'DELETE', before: c });
    return { ok: true as const };
  },
};
