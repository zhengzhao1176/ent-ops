import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { AppContext } from '../context';
import { warehouseRepo } from '../repositories/warehouse.repo';
import { auditService } from './audit.service';

export const warehouseService = {
  async create(
    ctx: AppContext,
    input: {
      code: string;
      name: string;
      kind: 'FINISHED' | 'RAW' | 'RETURN' | 'DEFECT';
      address?: string;
      managerId?: bigint;
    },
  ) {
    const dup = await warehouseRepo.findByCode(ctx.prisma, input.code);
    if (dup) throw new TRPCError({ code: 'CONFLICT', message: '仓库编码已存在' });
    const created = await warehouseRepo.create(ctx.prisma, {
      code: input.code,
      name: input.name,
      kind: input.kind,
      address: input.address ?? null,
      managerId: input.managerId ?? null,
      status: 'ACTIVE',
    });
    await auditService.log(ctx, {
      entity: 'Warehouse', entityId: created.id, actionType: 'CREATE', after: created,
    });
    return created;
  },

  async update(
    ctx: AppContext,
    input: {
      id: bigint;
      version: number;
      name?: string;
      kind?: 'FINISHED' | 'RAW' | 'RETURN' | 'DEFECT';
      address?: string;
      managerId?: bigint;
      status?: 'ACTIVE' | 'DISABLED';
    },
  ) {
    const before = await warehouseRepo.findById(ctx.prisma, input.id);
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: '仓库不存在' });
    const data: Prisma.WarehouseUncheckedUpdateInput = {
      name: input.name ?? undefined,
      kind: input.kind ?? undefined,
      address: input.address ?? undefined,
      managerId: input.managerId ?? undefined,
      status: input.status ?? undefined,
    };
    const count = await warehouseRepo.updateOptimistic(
      ctx.prisma,
      input.id,
      input.version,
      data as Prisma.WarehouseUpdateInput,
    );
    if (count === 0) {
      throw new TRPCError({ code: 'CONFLICT', message: '版本冲突或记录不存在' });
    }
    const after = await warehouseRepo.findById(ctx.prisma, input.id);
    await auditService.log(ctx, {
      entity: 'Warehouse', entityId: input.id, actionType: 'UPDATE', before, after,
    });
    return after!;
  },

  async list(
    ctx: AppContext,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      kind?: string;
      status?: string;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    return warehouseRepo.findPage(ctx.prisma, input);
  },

  async detail(ctx: AppContext, id: bigint) {
    const w = await warehouseRepo.findById(ctx.prisma, id);
    if (!w) throw new TRPCError({ code: 'NOT_FOUND', message: '仓库不存在' });
    return w;
  },

  async softDelete(ctx: AppContext, id: bigint) {
    const w = await warehouseRepo.findById(ctx.prisma, id);
    if (!w) throw new TRPCError({ code: 'NOT_FOUND', message: '仓库不存在' });
    const locCount = await warehouseRepo.countLocations(ctx.prisma, id);
    if (locCount > 0) {
      throw new TRPCError({ code: 'CONFLICT', message: '仓库下存在库位，不可删除' });
    }
    const stockCount = await warehouseRepo.countStocks(ctx.prisma, id);
    if (stockCount > 0) {
      throw new TRPCError({ code: 'CONFLICT', message: '仓库存在库存记录，不可删除' });
    }
    await warehouseRepo.softDelete(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Warehouse', entityId: id, actionType: 'DELETE', before: w,
    });
    return { ok: true as const };
  },

  async restore(ctx: AppContext, id: bigint) {
    const raw = await warehouseRepo.findByIdRaw(ctx.prisma, id);
    if (!raw || !raw.deletedAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '记录未删除' });
    }
    const restored = await warehouseRepo.restore(ctx.prisma, id);
    await auditService.log(ctx, {
      entity: 'Warehouse', entityId: id, actionType: 'RESTORE', after: restored,
    });
    return restored;
  },
};
