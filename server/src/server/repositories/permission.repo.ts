import type { Db } from './_base';

export const permissionRepo = {
  findById(db: Db, id: bigint) {
    return db.permission.findUnique({ where: { id } });
  },
  list(db: Db, kind?: 'MENU' | 'ACTION' | 'DATA') {
    return db.permission.findMany({ where: kind ? { kind } : {}, orderBy: { code: 'asc' } });
  },
  findByCode(db: Db, code: string) {
    return db.permission.findUnique({ where: { code } });
  },
  create(db: Db, data: { code: string; name: string; kind: string; parentId?: bigint }) {
    return db.permission.create({ data });
  },
  delete(db: Db, id: bigint) {
    return db.permission.delete({ where: { id } });
  },
  async listForUser(db: Db, userId: bigint): Promise<string[]> {
    const rows = await db.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const set = new Set<string>();
    rows.forEach((ur) => ur.role.permissions.forEach((rp) => set.add(rp.permission.code)));
    return Array.from(set);
  },
};
