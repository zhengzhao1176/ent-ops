import { z } from 'zod';

export const BigIntId = z
  .union([z.bigint(), z.number().int(), z.string().regex(/^\d+$/)])
  .transform((v) => (typeof v === 'bigint' ? v : BigInt(v)));

export const IdParam = z.object({ id: BigIntId });

export const Pagination = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});

export const SortInput = z
  .object({
    field: z.string().min(1),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .optional();

export const OkResp = z.object({ ok: z.literal(true) });

export const Timestamps = z.object({
  createdAt: z.date(),
  updatedAt: z.date().nullable().optional(),
});

export const StatusEnum = z.enum(['PENDING', 'ACTIVE', 'DISABLED', 'LOCKED', 'DELETED']);

export const PageResult = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    items: z.array(item),
  });
