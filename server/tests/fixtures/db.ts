import { PrismaClient } from '@prisma/client';

let _client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({ log: [] });
  }
  return _client;
}

export async function resetDb(): Promise<void> {
  const p = getPrisma();
  await p.$transaction([
    p.userRole.deleteMany(),
    p.rolePermission.deleteMany(),
    p.passwordHistory.deleteMany(),
    p.session.deleteMany(),
    p.loginAttempt.deleteMany(),
    p.auditLog.deleteMany(),
    p.outboundLine.deleteMany(),
    p.outbound.deleteMany(),
    p.inboundLine.deleteMany(),
    p.inbound.deleteMany(),
    p.stockLog.deleteMany(),
    p.stock.deleteMany(),
    p.location.deleteMany(),
    p.warehouse.deleteMany(),
    p.goods.deleteMany(),
    p.unit.deleteMany(),
    p.category.deleteMany(),
    p.user.deleteMany(),
    p.role.deleteMany(),
    p.permission.deleteMany(),
    p.department.deleteMany(),
  ]);
}

export async function disconnect(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}
