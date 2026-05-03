import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import { unitRepo } from '../repositories/unit.repo';
import { auditService } from './audit.service';

export const unitService = {
  async create(
    ctx: AppContext,
    input: {
      code: string;
      name: string;
      baseUnitId?: bigint;
      ratio?: string;
      status?: 'ACTIVE' | 'DISABLED';
    },
  ) {
    const existing = await unitRepo.findByCode(ctx.prisma, input.code);
    if (existing) throw new TRPCError({ code: 'CONFLICT', message: '单位编码已存在' });
    if (input.baseUnitId !== undefined) {
      const base = await unitRepo.findById(ctx.prisma, input.baseUnitId);
      if (!base) throw new TRPCError({ code: 'BAD_REQUEST', message: '基础单位不存在' });
    }
    const u = await unitRepo.create(ctx.prisma, {
      code: input.code,
      name: input.name,
      baseUnitId: input.baseUnitId ?? null,
      ratio: input.ratio ?? null,
      status: input.status ?? 'ACTIVE',
    });
    await auditService.log(ctx, {
      entity: 'Unit', entityId: u.id, actionType: 'CREATE', after: u,
    });
    return u;
  },

  async update(
    ctx: AppContext,
    input: {
      id: bigint;
      name?: string;
      baseUnitId?: bigint;
      ratio?: string;
      status?: 'ACTIVE' | 'DISABLED';
    },
  ) {
    const before = await unitRepo.findById(ctx.prisma, input.id);
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: '单位不存在' });
    if (input.baseUnitId !== undefined) {
      const base = await unitRepo.findById(ctx.prisma, input.baseUnitId);
      if (!base) throw new TRPCError({ code: 'BAD_REQUEST', message: '基础单位不存在' });
    }
    const after = await unitRepo.update(ctx.prisma, input.id, {
      name: input.name ?? undefined,
      baseUnitId: input.baseUnitId ?? undefined,
      ratio: input.ratio ?? undefined,
      status: input.status ?? undefined,
    });
    await auditService.log(ctx, {
      entity: 'Unit', entityId: input.id, actionType: 'UPDATE', before, after,
    });
    return after;
  },

  async list(ctx: AppContext, input?: { keyword?: string; status?: string }) {
    return unitRepo.list(ctx.prisma, input);
  },

  async detail(ctx: AppContext, id: bigint) {
    const u = await unitRepo.findById(ctx.prisma, id);
    if (!u) throw new TRPCError({ code: 'NOT_FOUND', message: '单位不存在' });
    return u;
  },

  async delete(ctx: AppContext, id: bigint) {
    const u = await unitRepo.findById(ctx.prisma, id);
    if (!u) throw new TRPCError({ code: 'NOT_FOUND', message: '单位不存在' });
    const goodsCount = await unitRepo.countGoods(ctx.prisma, id);
    if (goodsCount > 0) throw new TRPCError({ code: 'CONFLICT', message: '该单位被商品引用，不可删除' });
    await unitRepo.delete(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Unit', entityId: id, actionType: 'DELETE', before: u,
    });
    return { ok: true as const };
  },
};
