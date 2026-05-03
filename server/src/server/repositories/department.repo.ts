import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export const deptRepo = {
  findById(db: Db, id: bigint) {
    return db.department.findFirst({ where: { id, deletedAt: null } });
  },
  findByCode(db: Db, code: string) {
    return db.department.findFirst({ where: { code, deletedAt: null } });
  },
  list(db: Db, parentId?: bigint) {
    return db.department.findMany({
      where: { deletedAt: null, ...(parentId !== undefined ? { parentId } : {}) },
      orderBy: { sort: 'asc' },
    });
  },
  tree(db: Db) {
    return db.department.findMany({ where: { deletedAt: null }, orderBy: [{ depth: 'asc' }, { sort: 'asc' }] });
  },
  create(db: Db, data: Prisma.DepartmentUncheckedCreateInput) {
    return db.department.create({ data });
  },
  async updateOptimistic(db: Db, id: bigint, version: number, data: Prisma.DepartmentUpdateInput) {
    const r = await db.department.updateMany({ where: { id, version, deletedAt: null }, data: { ...data, version: { increment: 1 } } });
    return r.count;
  },
  async softDelete(db: Db, id: bigint) {
    return db.department.update({ where: { id }, data: { deletedAt: new Date() } });
  },
  async countUsers(db: Db, deptId: bigint) {
    return db.user.count({ where: { deptId, deletedAt: null } });
  },
  async findChildren(db: Db, parentId: bigint) {
    return db.department.findMany({ where: { parentId, deletedAt: null } });
  },
  async findDescendants(db: Db, ancestorPath: string) {
    return db.department.findMany({
      where: { path: { startsWith: ancestorPath + '/' }, deletedAt: null },
    });
  },
  async raw(db: Db, id: bigint) {
    return db.department.findUnique({ where: { id } });
  },
};
