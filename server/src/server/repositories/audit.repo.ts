import type { Db } from './_base';
import { Prisma } from '@prisma/client';

export const auditRepo = {
  append(db: Db, data: {
    operatorId?: bigint | null;
    operatorName?: string | null;
    ip?: string | null;
    actionType: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    result?: 'SUCCESS' | 'FAILURE';
    message?: string | null;
  }) {
    return db.auditLog.create({
      data: {
        operatorId: data.operatorId ?? null,
        operatorName: data.operatorName ?? null,
        ip: data.ip ?? null,
        actionType: data.actionType,
        entity: data.entity,
        entityId: data.entityId ?? null,
        before: data.before === undefined ? null : JSON.stringify(data.before, jsonReplacer),
        after: data.after === undefined ? null : JSON.stringify(data.after, jsonReplacer),
        result: data.result ?? 'SUCCESS',
        message: data.message ?? null,
      },
    });
  },

  async findPage(db: Db, input: {
    page: number; pageSize: number;
    keyword?: string; operatorId?: bigint; entity?: string; actionType?: string;
    result?: 'SUCCESS' | 'FAILURE'; from?: Date; to?: Date;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(input.operatorId !== undefined ? { operatorId: input.operatorId } : {}),
      ...(input.entity ? { entity: input.entity } : {}),
      ...(input.actionType ? { actionType: input.actionType } : {}),
      ...(input.result ? { result: input.result } : {}),
      ...(input.from || input.to
        ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
        : {}),
      ...(input.keyword
        ? {
            OR: [
              { operatorName: { contains: input.keyword } },
              { entity: { contains: input.keyword } },
              { actionType: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    const [total, rawItems] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    const items = rawItems.map((r) => ({
      ...r,
      before: r.before ? safeParse(r.before) : null,
      after: r.after ? safeParse(r.after) : null,
    }));
    return { total, page: input.page, pageSize: input.pageSize, items };
  },
};

function jsonReplacer(_k: string, v: unknown) {
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}
