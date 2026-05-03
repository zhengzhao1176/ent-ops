import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { AuditLogListInput } from '@/contracts/user/audit.contract';
import { auditRepo } from '../repositories/audit.repo';
import { permissionRepo } from '../repositories/permission.repo';

async function ensureCanRead(ctx: Parameters<typeof requireAuditAccess>[0]) {
  await requireAuditAccess(ctx);
}

async function requireAuditAccess(ctx: { user?: { id: bigint; isSuperAdmin: boolean }; prisma: import('@prisma/client').PrismaClient }) {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  if (ctx.user.isSuperAdmin) return;
  const perms = new Set(await permissionRepo.listForUser(ctx.prisma, ctx.user.id));
  if (!perms.has('audit:read')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '缺少审计查询权限' });
  }
}

export const auditRouter = router({
  list: protectedProcedure.input(AuditLogListInput).query(async ({ ctx, input }) => {
    await ensureCanRead(ctx);
    return auditRepo.findPage(ctx.prisma, input);
  }),
});
