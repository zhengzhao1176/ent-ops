import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import { locationRepo } from '../repositories/location.repo';
import { warehouseRepo } from '../repositories/warehouse.repo';
import { auditService } from './audit.service';

export const locationService = {
  async create(
    ctx: AppContext,
    input: {
      warehouseId: bigint;
      code: string;
      name: string;
      capacity?: string;
    },
  ) {
    const wh = await warehouseRepo.findById(ctx.prisma, input.warehouseId);
    if (!wh) throw new TRPCError({ code: 'BAD_REQUEST', message: '仓库不存在' });
    const dup = await locationRepo.findByWarehouseAndCode(
      ctx.prisma,
      input.warehouseId,
      input.code,
    );
    if (dup) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: '同仓库下库位编码已存在',
      });
    }
    const created = await locationRepo.create(ctx.prisma, {
      warehouseId: input.warehouseId,
      code: input.code,
      name: input.name,
      capacity: input.capacity ?? null,
      status: 'ACTIVE',
    });
    await auditService.log(ctx, {
      entity: 'Location', entityId: created.id, actionType: 'CREATE', after: created,
    });
    return created;
  },

  async update(
    ctx: AppContext,
    input: {
      id: bigint;
      version: number;
      name?: string;
      capacity?: string;
      status?: 'ACTIVE' | 'DISABLED';
    },
  ) {
    const before = await locationRepo.findById(ctx.prisma, input.id);
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: '库位不存在' });
    const data: Prisma.LocationUncheckedUpdateInput = {
      name: input.name ?? undefined,
      capacity: input.capacity ?? undefined,
      status: input.status ?? undefined,
    };
    const count = await locationRepo.updateOptimistic(
      ctx.prisma,
      input.id,
      input.version,
      data as Prisma.LocationUpdateInput,
    );
    if (count === 0) {
      throw new TRPCError({ code: 'CONFLICT', message: '版本冲突或记录不存在' });
    }
    const after = await locationRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, {
      entity: 'Location', entityId: input.id, actionType: 'UPDATE', before, after,
    });
    return after!;
  },

  async list(
    ctx: AppContext,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      warehouseId?: bigint;
      status?: string;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    return locationRepo.findPage(ctx.prisma, input);
  },

  async detail(ctx: AppContext, id: bigint) {
    const l = await locationRepo.findById(ctx.prisma, id);
    if (!l) throw new TRPCError({ code: 'NOT_FOUND', message: '库位不存在' });
    return l;
  },

  async softDelete(ctx: AppContext, id: bigint) {
    const l = await locationRepo.findById(ctx.prisma, id);
    if (!l) throw new TRPCError({ code: 'NOT_FOUND', message: '库位不存在' });
    const stockCount = await locationRepo.countStocks(ctx.prisma, id);
    if (stockCount > 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: '库位下存在库存记录，不可删除',
      });
    }
    await locationRepo.softDelete(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Location', entityId: id, actionType: 'DELETE', before: l,
    });
    return { ok: true as const };
  },

  async restore(ctx: AppContext, id: bigint) {
    const raw = await locationRepo.findByIdRaw(ctx.prisma, id);
    if (!raw || !raw.deletedAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '记录未删除' });
    }
    const restored = await locationRepo.restore(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Location', entityId: id, actionType: 'RESTORE', after: restored,
    });
    return restored;
  },
};
