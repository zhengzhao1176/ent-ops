import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import { goodsRepo } from '../repositories/goods.repo';
import { categoryRepo } from '../repositories/category.repo';
import { unitRepo } from '../repositories/unit.repo';
import { auditService } from './audit.service';

export const goodsService = {
  async create(
    ctx: AppContext,
    input: {
      code: string;
      name: string;
      categoryId: bigint;
      unitId: bigint;
      spec?: string;
      brand?: string;
      barcode?: string;
      safetyStock?: string;
      stockUpper?: string;
      shelfLifeDays?: number;
      image?: string;
      remark?: string;
    },
  ) {
    const dup = await goodsRepo.findByCode(ctx.prisma, input.code);
    if (dup) throw new TRPCError({ code: 'CONFLICT', message: '商品编码已存在' });
    const cat = await categoryRepo.findById(ctx.prisma, input.categoryId);
    if (!cat) throw new TRPCError({ code: 'BAD_REQUEST', message: '分类不存在' });
    const unit = await unitRepo.findById(ctx.prisma, input.unitId);
    if (!unit) throw new TRPCError({ code: 'BAD_REQUEST', message: '单位不存在' });

    const created = await goodsRepo.create(ctx.prisma, {
      code: input.code,
      name: input.name,
      categoryId: input.categoryId,
      unitId: input.unitId,
      spec: input.spec ?? null,
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      safetyStock: input.safetyStock ?? null,
      stockUpper: input.stockUpper ?? null,
      shelfLifeDays: input.shelfLifeDays ?? null,
      image: input.image ?? null,
      status: 'ACTIVE',
      remark: input.remark ?? null,
    });
    await auditService.log(ctx, {
      entity: 'Goods', entityId: created.id, actionType: 'CREATE', after: created,
    });
    return created;
  },

  async update(
    ctx: AppContext,
    input: {
      id: bigint;
      version: number;
      name?: string;
      categoryId?: bigint;
      spec?: string;
      brand?: string;
      barcode?: string;
      safetyStock?: string;
      stockUpper?: string;
      shelfLifeDays?: number;
      image?: string;
      remark?: string;
    },
  ) {
    const before = await goodsRepo.findById(ctx.prisma, input.id);
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: '商品不存在' });
    if (input.categoryId !== undefined) {
      const cat = await categoryRepo.findById(ctx.prisma, input.categoryId);
      if (!cat) throw new TRPCError({ code: 'BAD_REQUEST', message: '分类不存在' });
    }
    const data: Prisma.GoodsUncheckedUpdateInput = {
      name: input.name ?? undefined,
      categoryId: input.categoryId ?? undefined,
      spec: input.spec ?? undefined,
      brand: input.brand ?? undefined,
      barcode: input.barcode ?? undefined,
      safetyStock: input.safetyStock ?? undefined,
      stockUpper: input.stockUpper ?? undefined,
      shelfLifeDays: input.shelfLifeDays ?? undefined,
      image: input.image ?? undefined,
      remark: input.remark ?? undefined,
    };
    const count = await goodsRepo.updateOptimistic(
      ctx.prisma,
      input.id,
      input.version,
      data as Prisma.GoodsUpdateInput,
    );
    if (count === 0) throw new TRPCError({ code: 'CONFLICT', message: '版本冲突或记录不存在' });
    const after = await goodsRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, {
      entity: 'Goods', entityId: input.id, actionType: 'UPDATE', before, after,
    });
    return after!;
  },

  async list(
    ctx: AppContext,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      categoryId?: bigint;
      status?: string;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    return goodsRepo.findPage(ctx.prisma, input);
  },

  async detail(ctx: AppContext, id: bigint) {
    const g = await goodsRepo.findById(ctx.prisma, id);
    if (!g) throw new TRPCError({ code: 'NOT_FOUND', message: '商品不存在' });
    return g;
  },

  async softDelete(ctx: AppContext, id: bigint) {
    const g = await goodsRepo.findById(ctx.prisma, id);
    if (!g) throw new TRPCError({ code: 'NOT_FOUND', message: '商品不存在' });

    // BR-IM: 已存在库存或入库历史的商品禁止删除
    const stockExisting = await ctx.prisma.stock.count({
      where: { goodsId: id },
    });
    if (stockExisting > 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: '商品存在库存记录，不可删除',
      });
    }
    const inboundExisting = await ctx.prisma.inboundLine.count({
      where: { goodsId: id },
    });
    if (inboundExisting > 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: '商品存在入库历史，不可删除',
      });
    }

    await goodsRepo.softDelete(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Goods', entityId: id, actionType: 'DELETE', before: g,
    });
    return { ok: true as const };
  },

  async restore(ctx: AppContext, id: bigint) {
    const raw = await goodsRepo.findByIdRaw(ctx.prisma, id);
    if (!raw || !raw.deletedAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '记录未删除' });
    }
    const restored = await goodsRepo.restore(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Goods', entityId: id, actionType: 'RESTORE', after: restored,
    });
    return restored;
  },

  /**
   * Set status to DISABLED (the "disable" extra exposed via contract).
   */
  async disable(ctx: AppContext, id: bigint) {
    return this.setStatus(ctx, id, 'DISABLED');
  },

  async setStatus(ctx: AppContext, id: bigint, target: 'ACTIVE' | 'DISABLED') {
    const g = await goodsRepo.findById(ctx.prisma, id);
    if (!g) throw new TRPCError({ code: 'NOT_FOUND', message: '商品不存在' });
    if (g.status === target) return g;
    const updated = await goodsRepo.setStatus(ctx.prisma, id, target);
    await auditService.log(ctx, {
      entity: 'Goods', entityId: id, actionType: `STATUS_${target}`,
      before: { status: g.status }, after: { status: target },
    });
    return updated;
  },
};
