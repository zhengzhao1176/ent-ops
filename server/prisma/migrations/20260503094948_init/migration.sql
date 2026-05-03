-- CreateTable
CREATE TABLE "departments" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" BIGINT,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "roles" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parent_id" BIGINT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "employee_no" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "real_name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "dept_id" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "login_fail_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" DATETIME,
    "last_login_at" DATETIME,
    "last_login_ip" TEXT,
    "password_updated_at" DATETIME,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "avatar" TEXT,
    "nickname" TEXT,
    "remark" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    "created_by" BIGINT,
    "updated_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "users_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" BIGINT NOT NULL,
    "role_id" BIGINT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT,

    PRIMARY KEY ("user_id", "role_id"),
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" BIGINT NOT NULL,
    "permission_id" BIGINT NOT NULL,

    PRIMARY KEY ("role_id", "permission_id"),
    CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "password_histories" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "user_id" BIGINT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "login_id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "user_id" BIGINT,
    "reason" TEXT,
    "user_agent" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "expires_at" DATETIME NOT NULL,
    "revoked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "operator_id" BIGINT,
    "operator_name" TEXT,
    "ip" TEXT,
    "action_type" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" TEXT,
    "after" TEXT,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" BIGINT,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "units" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_unit_id" BIGINT,
    "ratio" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE'
);

-- CreateTable
CREATE TABLE "goods" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" BIGINT NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "spec" TEXT,
    "brand" TEXT,
    "barcode" TEXT,
    "safety_stock" TEXT,
    "stock_upper" TEXT,
    "shelf_life_days" INTEGER,
    "image" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "goods_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "goods_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "address" TEXT,
    "manager_id" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "locations" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "warehouse_id" BIGINT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "deleted_at" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "warehouse_id" BIGINT NOT NULL,
    "location_id" BIGINT NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "batch_no" TEXT NOT NULL DEFAULT '',
    "qty_on_hand" TEXT NOT NULL DEFAULT '0',
    "qty_locked" TEXT NOT NULL DEFAULT '0',
    "qty_available" TEXT NOT NULL DEFAULT '0',
    "qty_in_transit" TEXT NOT NULL DEFAULT '0',
    "expire_at" DATETIME,
    "updated_at" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stocks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stocks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stocks_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_logs" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "stock_id" BIGINT NOT NULL,
    "warehouse_id" BIGINT NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "change_type" TEXT NOT NULL,
    "qty_before" TEXT NOT NULL,
    "qty_change" TEXT NOT NULL,
    "qty_after" TEXT NOT NULL,
    "ref_doc_no" TEXT,
    "operator_id" BIGINT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_logs_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_logs_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inbounds" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "doc_no" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source_doc_no" TEXT,
    "warehouse_id" BIGINT NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "operation_at" DATETIME NOT NULL,
    "remark" TEXT,
    "status" INTEGER NOT NULL DEFAULT 10,
    "status_updated_at" DATETIME,
    "status_updated_by" BIGINT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "inbounds_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inbound_lines" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "inbound_id" BIGINT NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "location_id" BIGINT NOT NULL,
    "batch_no" TEXT NOT NULL DEFAULT '',
    "qty" TEXT NOT NULL,
    "unit_price" TEXT,
    "expire_at" DATETIME,
    CONSTRAINT "inbound_lines_inbound_id_fkey" FOREIGN KEY ("inbound_id") REFERENCES "inbounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inbound_lines_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "outbounds" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "doc_no" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_doc_no" TEXT,
    "warehouse_id" BIGINT NOT NULL,
    "applicant_id" BIGINT,
    "operator_id" BIGINT NOT NULL,
    "operation_at" DATETIME NOT NULL,
    "pick_strategy" TEXT NOT NULL DEFAULT 'FIFO',
    "remark" TEXT,
    "status" INTEGER NOT NULL DEFAULT 10,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "outbounds_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "outbound_lines" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "outbound_id" BIGINT NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "location_id" BIGINT NOT NULL,
    "batch_no" TEXT NOT NULL DEFAULT '',
    "qty" TEXT NOT NULL,
    CONSTRAINT "outbound_lines_outbound_id_fkey" FOREIGN KEY ("outbound_id") REFERENCES "outbounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "outbound_lines_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_parent_id_idx" ON "departments"("parent_id");

-- CreateIndex
CREATE INDEX "departments_deleted_at_idx" ON "departments"("deleted_at");

-- CreateIndex
CREATE INDEX "departments_status_idx" ON "departments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_deleted_at_idx" ON "roles"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_parent_id_idx" ON "permissions"("parent_id");

-- CreateIndex
CREATE INDEX "permissions_kind_idx" ON "permissions"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_no_key" ON "users"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_dept_id_idx" ON "users"("dept_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "password_histories_user_id_created_at_idx" ON "password_histories"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_login_id_created_at_idx" ON "login_attempts"("login_id", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_created_at_idx" ON "login_attempts"("ip", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_user_id_idx" ON "login_attempts"("user_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_operator_id_created_at_idx" ON "audit_logs"("operator_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_created_at_idx" ON "audit_logs"("entity", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_type_created_at_idx" ON "audit_logs"("action_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_deleted_at_idx" ON "categories"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "goods_code_key" ON "goods"("code");

-- CreateIndex
CREATE INDEX "goods_category_id_idx" ON "goods"("category_id");

-- CreateIndex
CREATE INDEX "goods_deleted_at_idx" ON "goods"("deleted_at");

-- CreateIndex
CREATE INDEX "goods_status_idx" ON "goods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_deleted_at_idx" ON "warehouses"("deleted_at");

-- CreateIndex
CREATE INDEX "locations_deleted_at_idx" ON "locations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "locations_warehouse_id_code_key" ON "locations"("warehouse_id", "code");

-- CreateIndex
CREATE INDEX "stocks_goods_id_idx" ON "stocks"("goods_id");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_warehouse_id_location_id_goods_id_batch_no_key" ON "stocks"("warehouse_id", "location_id", "goods_id", "batch_no");

-- CreateIndex
CREATE INDEX "stock_logs_stock_id_created_at_idx" ON "stock_logs"("stock_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_logs_goods_id_created_at_idx" ON "stock_logs"("goods_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbounds_doc_no_key" ON "inbounds"("doc_no");

-- CreateIndex
CREATE INDEX "inbounds_warehouse_id_status_idx" ON "inbounds"("warehouse_id", "status");

-- CreateIndex
CREATE INDEX "inbounds_status_idx" ON "inbounds"("status");

-- CreateIndex
CREATE INDEX "inbound_lines_inbound_id_idx" ON "inbound_lines"("inbound_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbounds_doc_no_key" ON "outbounds"("doc_no");

-- CreateIndex
CREATE INDEX "outbounds_warehouse_id_status_idx" ON "outbounds"("warehouse_id", "status");

-- CreateIndex
CREATE INDEX "outbounds_status_idx" ON "outbounds"("status");

-- CreateIndex
CREATE INDEX "outbound_lines_outbound_id_idx" ON "outbound_lines"("outbound_id");
