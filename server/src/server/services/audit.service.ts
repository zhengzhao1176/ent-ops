import type { Db } from '../repositories/_base';
import { auditRepo } from '../repositories/audit.repo';
import type { AppContext } from '../context';

export interface AuditLogInput {
  entity: string;
  entityId?: string | bigint | null;
  actionType: string;
  before?: unknown;
  after?: unknown;
  result?: 'SUCCESS' | 'FAILURE';
  message?: string;
}

export const auditService = {
  async log(ctx: AppContext, input: AuditLogInput, db?: Db) {
    const target = db ?? ctx.prisma;
    return auditRepo.append(target, {
      operatorId: ctx.user?.id ?? null,
      operatorName: ctx.user?.realName ?? null,
      ip: ctx.ip ?? null,
      actionType: input.actionType,
      entity: input.entity,
      entityId: input.entityId === undefined || input.entityId === null ? null : String(input.entityId),
      before: input.before,
      after: input.after,
      result: input.result ?? 'SUCCESS',
      message: input.message,
    });
  },
};
