import { z } from 'zod';
import { BigIntId } from '../_shared';

// Reports have no entity of their own; these procedures aggregate over
// existing Goods/Stock/Inbound/Outbound/StockLog tables. Read-only.

// ---------- summary ----------
export const ReportSummaryInput = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
  warehouseId: BigIntId.optional(),
});

export const ReportSummaryOutput = z.object({
  goodsCount: z.number().int(),
  activeWarehouseCount: z.number().int(),
  totalStockOnHand: z.string(),
  lockedStockTotal: z.string(),
  inboundCount: z.number().int(),
  outboundCount: z.number().int(),
  transferCount: z.number().int(),
  stocktakeCount: z.number().int(),
  lowStockCount: z.number().int(),
});

// ---------- dailyMovement ----------
export const ReportDailyMovementInput = z.object({
  from: z.date(),
  to: z.date(),
  warehouseId: BigIntId.optional(),
});

export const ReportDailyMovementOutput = z.array(
  z.object({
    date: z.string(),
    inboundQty: z.string(),
    outboundQty: z.string(),
  }),
);

// ---------- topGoodsByMovement ----------
export const ReportTopGoodsByMovementInput = z.object({
  from: z.date(),
  to: z.date(),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'BOTH']),
  limit: z.number().int().min(1).max(100).default(10),
});

export const ReportTopGoodsByMovementOutput = z.array(
  z.object({
    goodsId: BigIntId,
    goodsCode: z.string(),
    goodsName: z.string(),
    totalIn: z.string(),
    totalOut: z.string(),
    netChange: z.string(),
  }),
);

// ---------- slowMovingGoods ----------
export const ReportSlowMovingGoodsInput = z.object({
  days: z.number().int().min(1).max(3650).default(90),
  warehouseId: BigIntId.optional(),
  limit: z.number().int().min(1).max(500).default(50),
});

export const ReportSlowMovingGoodsOutput = z.array(
  z.object({
    goodsId: BigIntId,
    goodsCode: z.string(),
    goodsName: z.string(),
    qtyOnHand: z.string(),
    lastOutboundAt: z.date().nullable(),
    daysSinceLastOutbound: z.number().int().nullable(),
  }),
);

// ---------- stockByWarehouse ----------
export const ReportStockByWarehouseInput = z.object({}).optional();

export const ReportStockByWarehouseOutput = z.array(
  z.object({
    warehouseId: BigIntId,
    warehouseCode: z.string(),
    warehouseName: z.string(),
    skuCount: z.number().int(),
    totalQty: z.string(),
    totalLocked: z.string(),
  }),
);

export const reportContract = {
  summary: { input: ReportSummaryInput, output: ReportSummaryOutput },
  dailyMovement: {
    input: ReportDailyMovementInput,
    output: ReportDailyMovementOutput,
  },
  topGoodsByMovement: {
    input: ReportTopGoodsByMovementInput,
    output: ReportTopGoodsByMovementOutput,
  },
  slowMovingGoods: {
    input: ReportSlowMovingGoodsInput,
    output: ReportSlowMovingGoodsOutput,
  },
  stockByWarehouse: {
    input: ReportStockByWarehouseInput,
    output: ReportStockByWarehouseOutput,
  },
};
