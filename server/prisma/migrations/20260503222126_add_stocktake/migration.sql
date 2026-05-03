-- CreateTable
CREATE TABLE "stocktakes" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "doc_no" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "warehouse_id" BIGINT NOT NULL,
    "location_ids" TEXT,
    "category_ids" TEXT,
    "operator_id" BIGINT NOT NULL,
    "operation_at" DATETIME NOT NULL,
    "reason" TEXT,
    "remark" TEXT,
    "status" INTEGER NOT NULL DEFAULT 10,
    "status_updated_at" DATETIME,
    "status_updated_by" BIGINT,
    "gain_doc_no" TEXT,
    "loss_doc_no" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stocktakes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stocktake_lines" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "stocktake_id" BIGINT NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "location_id" BIGINT NOT NULL,
    "batch_no" TEXT NOT NULL DEFAULT '',
    "book_qty" TEXT NOT NULL,
    "actual_qty" TEXT,
    "difference" TEXT,
    "reason" TEXT,
    CONSTRAINT "stocktake_lines_stocktake_id_fkey" FOREIGN KEY ("stocktake_id") REFERENCES "stocktakes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stocktake_lines_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "stocktakes_doc_no_key" ON "stocktakes"("doc_no");

-- CreateIndex
CREATE INDEX "stocktakes_warehouse_id_status_idx" ON "stocktakes"("warehouse_id", "status");

-- CreateIndex
CREATE INDEX "stocktakes_status_idx" ON "stocktakes"("status");

-- CreateIndex
CREATE INDEX "stocktake_lines_stocktake_id_idx" ON "stocktake_lines"("stocktake_id");
