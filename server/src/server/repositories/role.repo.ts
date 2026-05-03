import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export const roleRepo = {
  findById(db: Db, id: bigint) {
    return db.role.findFirst({ where: { id, deletedAt: null } });
  },
  findByCode(db: Db, code: string) {
    return db.role.findFirst({ where: { code } });
  },
  async findPage(db: Db, input: {
    page: number; pageSize: number; keyword?: string; isBuiltin?: boolean;
    sortField?: string; sortOrder?: 'asc' | 'desc';
  }) {
    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
      ...(input.isBuiltin !== undefined ? { isBuiltin: input.isBuiltin } : {}),
      ...(input.keyword
        ? { OR: [{ code: { contains: input.keyword } }, { name: { contains: input.keyword } }] }
        : {}),
    };
    const orderBy: Prisma.RoleOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.RoleOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.role.count({ where }),
      db.role.findMany({ where, orderBy, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    ]);
    return { total, page: input.page, pageSize: input.pageSize, items };
  },
  create(db: Db, data: Prisma.RoleCreateInput) {
    return db.role.create({ data });
  },
  async updateOptimistic(db: Db, id: bigint, version: number, data: Prisma.RoleUpdateInput) {
    const r = await db.role.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },
  async softDelete(db: Db, id: bigint) {
    return db.role.update({ where: { id }, data: { deletedAt: new Date() } });
  },
  countUsers(db: Db, roleId: bigint) {
    return db.userRole.count({ where: { roleId } });
  },
  async listPermissions(db: Db, roleId: bigint) {
    const rps = await db.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rps.map((r) => r.permission);
  },
  async setPermissions(db: Db, roleId: bigint, permissionIds: bigint[]) {
    await db.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length) {
      await db.rolePermission.createMany({
        data: permissionIds.map((pid) => ({ roleId, permissionId: pid })),
      });
    }
  },
};
