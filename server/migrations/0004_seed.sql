-- Initial seed: 8 built-in roles, 9 permissions, ROOT + TECH departments,
-- admin (ROLE_SUPER_ADMIN) and sysadmin (ROLE_SYS_ADMIN) users.
-- Password for both: Aa123456 (bcrypt cost=10, pre-computed).
-- Idempotent via INSERT OR IGNORE.

-- ============ Roles ============
INSERT OR IGNORE INTO roles (code, name, is_builtin, version, updated_at) VALUES
  ('ROLE_SUPER_ADMIN',    '超级管理员', 1, 0, CURRENT_TIMESTAMP),
  ('ROLE_SYS_ADMIN',      '系统管理员', 1, 0, CURRENT_TIMESTAMP),
  ('ROLE_WAREHOUSE_MGR',  '仓库主管',   1, 0, CURRENT_TIMESTAMP),
  ('ROLE_WAREHOUSE_OP',   '仓库管理员', 1, 0, CURRENT_TIMESTAMP),
  ('ROLE_PURCHASER',      '采购员',     1, 0, CURRENT_TIMESTAMP),
  ('ROLE_SALES',          '销售员',     1, 0, CURRENT_TIMESTAMP),
  ('ROLE_AUDITOR',        '审计员',     1, 0, CURRENT_TIMESTAMP),
  ('ROLE_USER',           '普通用户',   1, 0, CURRENT_TIMESTAMP);

-- ============ Permissions ============
INSERT OR IGNORE INTO permissions (code, name, kind) VALUES
  ('user:read',   '用户查询',  'ACTION'),
  ('user:write',  '用户编辑',  'ACTION'),
  ('user:delete', '用户删除',  'ACTION'),
  ('role:read',   '角色查询',  'ACTION'),
  ('role:write',  '角色编辑',  'ACTION'),
  ('audit:read',  '审计查询',  'ACTION'),
  ('inv:read',    '库存查询',  'ACTION'),
  ('inv:write',   '库存录入',  'ACTION'),
  ('inv:audit',   '单据审核',  'ACTION');

-- ============ Departments ============
INSERT OR IGNORE INTO departments (code, name, parent_id, path, depth, sort, status, version, updated_at) VALUES
  ('ROOT', '总部',   NULL, '/ROOT',      0, 0, 'ACTIVE', 0, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO departments (code, name, parent_id, path, depth, sort, status, version, updated_at) VALUES
  ('TECH', '技术部', (SELECT id FROM departments WHERE code='ROOT'), '/ROOT/TECH', 1, 1, 'ACTIVE', 0, CURRENT_TIMESTAMP);

-- ============ Users ============
INSERT OR IGNORE INTO users
  (employee_no, username, real_name, mobile, email, password_hash, dept_id, status, login_fail_count, must_change_password, password_updated_at, version, updated_at)
VALUES
  ('A0001', 'admin', '超级管理员', '13800000001', 'admin@local',
   '$2a$10$HLNNpSqwFyM5qWA5dXKnQukT5NUobKTORJzRU6hrtje9wUMAx6jtK',
   (SELECT id FROM departments WHERE code='ROOT'),
   'ACTIVE', 0, 0, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP),
  ('A0002', 'sysadmin', '系统管理员', '13800000002', 'sys@local',
   '$2a$10$HLNNpSqwFyM5qWA5dXKnQukT5NUobKTORJzRU6hrtje9wUMAx6jtK',
   (SELECT id FROM departments WHERE code='TECH'),
   'ACTIVE', 0, 0, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP);

-- ============ Role bindings ============
INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES
  ((SELECT id FROM users WHERE username='admin'),    (SELECT id FROM roles WHERE code='ROLE_SUPER_ADMIN')),
  ((SELECT id FROM users WHERE username='sysadmin'), (SELECT id FROM roles WHERE code='ROLE_SYS_ADMIN'));
