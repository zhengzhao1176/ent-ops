import { z } from 'zod';
import { BigIntId, IdParam, OkResp } from '../_shared';

export const PermissionSchema = z.object({
  id: BigIntId,
  code: z.string(),
  name: z.string(),
  kind: z.enum(['MENU', 'ACTION', 'DATA']),
  parentId: BigIntId.nullable(),
  createdAt: z.date(),
});

export const PermissionCreateInput = z.object({
  code: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  kind: z.enum(['MENU', 'ACTION', 'DATA']),
  parentId: BigIntId.optional(),
});

export const permissionContract = {
  list: { input: z.object({ kind: z.enum(['MENU', 'ACTION', 'DATA']).optional() }).optional(), output: z.array(PermissionSchema) },
  tree: { input: z.object({}).optional(), output: z.array(PermissionSchema) },
  detail: { input: IdParam, output: PermissionSchema },
  create: { input: PermissionCreateInput, output: PermissionSchema },
  delete: { input: IdParam, output: OkResp },
  checkMine: {
    input: z.object({ codes: z.array(z.string().min(1).max(128)).max(50) }),
    output: z.record(z.string(), z.boolean()),
  },
};
