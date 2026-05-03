import { Prisma } from '@prisma/client';
import type { Db } from './_base';

export const userRepo = {
  findById(db: Db, id: bigint, opts?: { includeDeleted?: boolean }) {
    return db.user.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findByLoginId(db: Db, loginId: string) {
    return db.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ username: loginId }, { mobile: loginId }, { email: loginId }],
      },
    });
  },

  findByEmployeeNo(db: Db, employeeNo: string) {
    return db.user.findFirst({ where: { employeeNo } });
  },

  async findPage(
    db: Db,
    input: {
      page: number;
      pageSize: number;
      keyword?: string;
      status?: string;
      deptId?: bigint;
      includeDeleted?: boolean;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.UserWhereInput = {
      ...(input.includeDeleted ? {} : { deletedAt: null }),
      ...(input.status ? { status: input.status } : {}),
      ...(input.deptId !== undefined ? { deptId: input.deptId } : {}),
      ...(input.keyword
        ? {
            OR: [
              { employeeNo: { contains: input.keyword } },
              { username: { contains: input.keyword } },
              { realName: { contains: input.keyword } },
              { mobile: { contains: input.keyword } },
              { email: { contains: input.keyword } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [input.sortField ?? 'createdAt']: input.sortOrder ?? 'desc',
    } as Prisma.UserOrderByWithRelationInput;
    const [total, items] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, page: input.page, pageSize: input.pageSize, items };
  },

  create(db: Db, data: Prisma.UserCreateInput) {
    return db.user.create({ data });
  },

  async updateOptimistic(
    db: Db,
    id: bigint,
    version: number,
    data: Prisma.UserUpdateInput,
  ) {
    const r = await db.user.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    return r.count;
  },

  async findByIdRequired(db: Db, id: bigint) {
    const u = await db.user.findUnique({ where: { id } });
    if (!u) throw new Error('NOT_FOUND');
    return u;
  },

  async incrementLoginFail(db: Db, id: bigint, lockedUntil: Date | null) {
    return db.user.update({
      where: { id },
      data: {
        loginFailCount: { increment: 1 },
        ...(lockedUntil ? { lockedUntil, status: 'LOCKED' } : {}),
      },
    });
  },

  async resetLoginFail(db: Db, id: bigint, when: Date, ip: string | undefined) {
    return db.user.update({
      where: { id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
        status: 'ACTIVE',
        lastLoginAt: when,
        lastLoginIp: ip ?? null,
      },
    });
  },

  countSuperAdmins(db: Db) {
    return db.user.count({
      where: {
        deletedAt: null,
        status: { in: ['ACTIVE', 'PENDING'] },
        roles: { some: { role: { code: 'ROLE_SUPER_ADMIN' } } },
      },
    });
  },

  async hasSuperAdminRole(db: Db, userId: bigint): Promise<boolean> {
    const r = await db.userRole.findFirst({
      where: { userId, role: { code: 'ROLE_SUPER_ADMIN' } },
    });
    return !!r;
  },
};
