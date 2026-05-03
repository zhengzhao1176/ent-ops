import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { resetDb, getPrisma } from '../fixtures/db';
import { seedBaseRoles, seedRootDepartment, seedUser } from '../fixtures/factories';
import { anonymousCaller, callerForUserId } from '../fixtures/caller';

describe('auth.* (F-UM-02 / F-UM-04)', () => {
  beforeAll(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });
  beforeEach(async () => {
    await resetDb();
    await seedBaseRoles();
    await seedRootDepartment();
  });

  describe('login', () => {
    it('正确账号密码可登录', async () => {
      const { user } = await seedUser({ status: 'ACTIVE' });
      const c = anonymousCaller();
      const out = await c.auth.login({ loginId: user.username, password: 'Aa123456' });
      expect(out.token).toBeTruthy();
      expect(out.user.id).toBe(user.id);
    });

    it('C-UM-02-005 支持 username/mobile/email 三种 loginId', async () => {
      const { user } = await seedUser({ status: 'ACTIVE' });
      const c = anonymousCaller();
      for (const id of [user.username, user.mobile, user.email]) {
        const r = await c.auth.login({ loginId: id, password: 'Aa123456' });
        expect(r.token).toBeTruthy();
      }
      const attempts = await getPrisma().loginAttempt.findMany({});
      expect(attempts.filter((a) => a.success).length).toBe(3);
    });

    it('账号不存在应报 UNAUTHORIZED', async () => {
      const c = anonymousCaller();
      await expect(c.auth.login({ loginId: 'no-such', password: 'whatever' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('密码错误应报 UNAUTHORIZED 且写 LoginAttempt success=false', async () => {
      const { user } = await seedUser({ status: 'ACTIVE' });
      const c = anonymousCaller();
      await expect(c.auth.login({ loginId: user.username, password: 'wrong' })).rejects.toBeInstanceOf(TRPCError);
      const attempts = await getPrisma().loginAttempt.findMany({ where: { success: false } });
      expect(attempts.length).toBe(1);
      expect(attempts[0].reason).toMatch(/BAD_PASSWORD|INVALID/);
    });

    it('C-UM-02-001 连续 5 次密码错误锁 30 分钟', async () => {
      const { user } = await seedUser({ status: 'ACTIVE' });
      const c = anonymousCaller();
      for (let i = 0; i < 5; i++) {
        await expect(c.auth.login({ loginId: user.username, password: 'wrong' })).rejects.toBeInstanceOf(TRPCError);
      }
      const u2 = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(u2.status).toBe('LOCKED');
      expect(u2.lockedUntil).toBeTruthy();
      expect(u2.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000);
    });

    it('C-UM-02-002 锁定期间正确密码也拒绝', async () => {
      const { user } = await seedUser({
        status: 'LOCKED',
        password: 'Aa123456',
      });
      await getPrisma().user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + 60_000) },
      });
      const c = anonymousCaller();
      await expect(c.auth.login({ loginId: user.username, password: 'Aa123456' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('C-UM-02-003 锁定到期可登录且 lockedUntil 清空', async () => {
      const { user } = await seedUser({ status: 'LOCKED', password: 'Aa123456' });
      await getPrisma().user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000), loginFailCount: 5 },
      });
      const c = anonymousCaller();
      const r = await c.auth.login({ loginId: user.username, password: 'Aa123456' });
      expect(r.token).toBeTruthy();
      const u2 = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(u2.status).toBe('ACTIVE');
      expect(u2.loginFailCount).toBe(0);
      expect(u2.lockedUntil).toBeNull();
    });

    it('C-UM-07-003 已 DISABLED 用户登录被拒', async () => {
      const { user } = await seedUser({ status: 'DISABLED' });
      const c = anonymousCaller();
      await expect(c.auth.login({ loginId: user.username, password: 'Aa123456' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('PENDING 用户登录被拒', async () => {
      const { user } = await seedUser({ status: 'PENDING' });
      const c = anonymousCaller();
      await expect(c.auth.login({ loginId: user.username, password: 'Aa123456' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('changePassword', () => {
    it('C-UM-04-005 改密成功后 mustChangePassword=false 且 passwordUpdatedAt 更新', async () => {
      const { user } = await seedUser({ status: 'ACTIVE', mustChangePassword: true });
      const c = await callerForUserId(user.id);
      await c.auth.changePassword({
        oldPassword: 'Aa123456',
        newPassword: 'NewPass1!',
        confirmPassword: 'NewPass1!',
      });
      const u2 = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(u2.mustChangePassword).toBe(false);
      expect(u2.passwordUpdatedAt).toBeTruthy();
    });

    it('原密码错误应报 UNAUTHORIZED', async () => {
      const { user } = await seedUser({ status: 'ACTIVE' });
      const c = await callerForUserId(user.id);
      await expect(
        c.auth.changePassword({
          oldPassword: 'wrong',
          newPassword: 'NewPass1!',
          confirmPassword: 'NewPass1!',
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('两次新密码不一致拒绝', async () => {
      const { user } = await seedUser({ status: 'ACTIVE' });
      const c = await callerForUserId(user.id);
      await expect(
        c.auth.changePassword({
          oldPassword: 'Aa123456',
          newPassword: 'NewPass1!',
          confirmPassword: 'OtherPass1!',
        }),
      ).rejects.toBeInstanceOf(TRPCError);
    });

    it('C-UM-04-003 新密码不可与最近 3 次相同', async () => {
      const { user } = await seedUser({ status: 'ACTIVE', password: 'Aa123456' });
      const c = await callerForUserId(user.id);
      // 先改成 P1 P2 P3
      await c.auth.changePassword({ oldPassword: 'Aa123456', newPassword: 'PaSs0001!', confirmPassword: 'PaSs0001!' });
      await c.auth.changePassword({ oldPassword: 'PaSs0001!', newPassword: 'PaSs0002!', confirmPassword: 'PaSs0002!' });
      await c.auth.changePassword({ oldPassword: 'PaSs0002!', newPassword: 'PaSs0003!', confirmPassword: 'PaSs0003!' });
      // 再改回 P1 应被拒
      await expect(
        c.auth.changePassword({
          oldPassword: 'PaSs0003!',
          newPassword: 'PaSs0001!',
          confirmPassword: 'PaSs0001!',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('me + mustChangePassword middleware', () => {
    it('C-UM-04-004 mustChangePassword=true 调用受保护接口报 PRECONDITION_FAILED', async () => {
      const { user } = await seedUser({ status: 'ACTIVE', mustChangePassword: true, roleCodes: ['ROLE_SYS_ADMIN'] });
      const c = await callerForUserId(user.id);
      await expect(c.user.list({ page: 1, pageSize: 10 })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
    });

    it('me 接口可在 mustChangePassword=true 时访问', async () => {
      const { user } = await seedUser({ status: 'ACTIVE', mustChangePassword: true });
      const c = await callerForUserId(user.id);
      const me = await c.auth.me();
      expect(me.id).toBe(user.id);
      expect(me.mustChangePassword).toBe(true);
    });
  });
});
