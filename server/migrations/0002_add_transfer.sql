-- CreateTable
CREATE TABLE "transfers" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "doc_no" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "from_warehouse_id" BIGINT NOT NULL,
    "from_location_id" BIGINT NOT NULL,
    "to_warehouse_id" BIGINT NOT NULL,
    "to_location_id" BIGINT NOT NULL,
    "applicant_id" BIGINT,
    "operator_id" BIGINT NOT NULL,
    "operation_at" DATETIME NOT NULL,
    "reason" TEXT,
    "remark" TEXT,
    "status" INTEGER NOT NULL DEFAULT 10,
    "status_updated_at" DATETIME,
    "status_updated_by" BIGINT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "transfers_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transfers_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transfer_lines" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "transfer_id" BIGINT NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "batch_no" TEXT NOT NULL DEFAULT '',
    "qty" TEXT NOT NULL,
    "shipped_qty" TEXT,
    "received_qty" TEXT,
    CONSTRAINT "transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transfer_lines_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "transfers_doc_no_key" ON "transfers"("doc_no");

-- CreateIndex
CREATE INDEX "transfers_from_warehouse_id_status_idx" ON "transfers"("from_warehouse_id", "status");

-- CreateIndex
CREATE INDEX "transfers_to_warehouse_id_status_idx" ON "transfers"("to_warehouse_id", "status");

-- CreateIndex
CREATE INDEX "transfers_status_idx" ON "transfers"("status");

-- CreateIndex
CREATE INDEX "transfer_lines_transfer_id_idx" ON "transfer_lines"("transfer_id");
