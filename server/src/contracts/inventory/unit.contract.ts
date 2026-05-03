import { z } from 'zod';
import { BigIntId, IdParam, OkResp } from '../_shared';

const Decimal = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, '数量需为 ≤4 位小数');

export const UnitStatus = z.enum(['ACTIVE', 'DISABLED']);

export const UnitSchema = z.object({
  id: BigIntId,
  code: z.string(),
  name: z.string(),
  baseUnitId: BigIntId.nullable(),
  ratio: Decimal.nullable(),
  status: UnitStatus,
});

export const UnitCreateInput = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
  baseUnitId: BigIntId.optional(),
  ratio: Decimal.optional(),
  status: UnitStatus.default('ACTIVE'),
});

export const UnitUpdateInput = z.object({
  id: BigIntId,
  name: z.string().min(1).max(64).optional(),
  baseUnitId: BigIntId.optional(),
  ratio: Decimal.optional(),
  status: UnitStatus.optional(),
});

export const UnitListInput = z
  .object({
    keyword: z.string().max(128).optional(),
    status: UnitStatus.optional(),
  })
  .optional();

export const unitContract = {
  list: { input: UnitListInput, output: z.array(UnitSchema) },
  detail: { input: IdParam, output: UnitSchema },
  create: { input: UnitCreateInput, output: UnitSchema },
  update: { input: UnitUpdateInput, output: UnitSchema },
  delete: { input: IdParam, output: OkResp },
};
