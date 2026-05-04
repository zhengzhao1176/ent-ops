import { test, expect, type Page, type Response } from '@playwright/test';

// ============================================================================
// Helpers (mirrors inbound.admin.spec.ts — kept self-contained per task brief)
// ============================================================================

function trpcGetUrl(path: string, json: unknown, meta?: unknown): string {
  const inner: Record<string, unknown> = { json };
  if (meta) inner.meta = meta;
  const wrapped = { '0': inner };
  return `/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(wrapped))}&batch=1`;
}

async function trpcQuery<T = unknown>(
  page: Page, path: string, json: unknown, meta?: unknown,
): Promise<T> {
  const url = trpcGetUrl(path, json, meta);
  const res = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    return { status: r.status, text: await r.text() };
  }, url);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`tRPC ${path} failed: HTTP ${res.status} ${res.text}`);
  }
  const parsed = JSON.parse(res.text) as Array<{ result?: { data?: { json?: T } }; error?: unknown }>;
  if (parsed?.[0]?.error) throw new Error(`tRPC ${path} error: ${JSON.stringify(parsed[0].error)}`);
  return parsed[0]?.result?.data?.json as T;
}

async function trpcMutationRaw(
  page: Page, path: string, json: unknown, meta?: unknown,
): Promise<{ status: number; ok: boolean; payload: unknown }> {
  const inner: Record<string, unknown> = { json };
  if (meta) inner.meta = meta;
  const wrapped = { '0': inner };
  const url = `/api/trpc/${path}?batch=1`;
  const res = await page.evaluate(async ({ u, w }) => {
    const r = await fetch(u, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(w),
    });
    return { status: r.status, text: await r.text() };
  }, { u: url, w: wrapped });
  let payload: unknown;
  try { payload = JSON.parse(res.text); } catch { payload = res.text; }
  return { status: res.status, ok: res.status >= 200 && res.status < 300, payload };
}

async function trpcMutation<T = unknown>(
  page: Page, path: string, json: unknown, meta?: unknown,
): Promise<T> {
  const r = await trpcMutationRaw(page, path, json, meta);
  if (!r.ok) throw new Error(`tRPC ${path} failed: HTTP ${r.status} ${JSON.stringify(r.payload)}`);
  const parsed = r.payload as Array<{ result?: { data?: { json?: T } }; error?: unknown }>;
  if (parsed?.[0]?.error) throw new Error(`tRPC ${path} error: ${JSON.stringify(parsed[0].error)}`);
  return parsed[0]?.result?.data?.json as T;
}

async function readIdFromTrpcResponse(res: Response): Promise<string> {
  const body = (await res.json()) as Array<{
    result?: { data?: { json?: { id?: string | number } } };
  }>;
  const id = body?.[0]?.result?.data?.json?.id;
  if (id == null) throw new Error('tRPC response missing json.id: ' + JSON.stringify(body));
  return String(id);
}

async function resolveSeedIds(page: Page): Promise<{
  operatorId: string; warehouseId: string; locationId: string;
}> {
  const me = await trpcQuery<{ id: string }>(page, 'auth.me', {});
  const wh = await trpcQuery<{ items: Array<{ id: string; code: string }> }>(
    page, 'warehouse.list', { page: 1, pageSize: 50 },
  );
  const mainWh = wh.items.find((w) => w.code === 'WH-MAIN') ?? wh.items[0];
  const loc = await trpcQuery<{ items: Array<{ id: string; code: string }> }>(
    page, 'location.list', { page: 1, pageSize: 50, warehouseId: mainWh.id },
  );
  const mainLoc = loc.items.find((l) => l.code === 'LOC-A1') ?? loc.items[0];
  return { operatorId: me.id, warehouseId: mainWh.id, locationId: mainLoc.id };
}

// Seed a brand-new goods record via the (working) /inv/goods/new UI helper.
async function seedGoodsViaUI(page: Page, codeSuffix: string): Promise<string> {
  await page.goto('/inv/goods/new');
  await page.getByTestId('input-code').fill(`G-${codeSuffix}`);
  await page.getByTestId('input-name').fill(`E2E商品-${codeSuffix}`);
  await page.getByTestId('select-categoryId').selectOption({ index: 1 });
  await page.getByTestId('select-unitId').selectOption({ index: 1 });

  const respPromise = page.waitForResponse(
    (r) => r.url().includes('/api/trpc/goods.create') && r.request().method() === 'POST',
  );
  await page.getByTestId('btn-submit').click();
  const resp = await respPromise;
  expect(resp.ok()).toBe(true);
  await expect(page.getByTestId('success-msg')).toContainText('创建成功');
  return await readIdFromTrpcResponse(resp);
}

// Create + submit + audit one inbound entry via tRPC API. Mirrors the helper
// in inbound.admin.spec.ts; the /inv/inbound/new UI is blocked by a separate
// pageSize=500 bug, so we go straight through the contract layer for seed data.
async function seedAuditedInbound(
  page: Page,
  args: {
    goodsId: string; operatorId: string; warehouseId: string;
    locationId: string; qty: string; sourceDocNo?: string;
  },
): Promise<string> {
  const operationAt = new Date();
  const created = await trpcMutation<{ id: string }>(
    page,
    'inbound.create',
    {
      kind: 'PURCHASE',
      sourceDocNo: args.sourceDocNo,
      warehouseId: args.warehouseId,
      operatorId: args.operatorId,
      operationAt: operationAt.toISOString(),
      lines: [
        { goodsId: args.goodsId, locationId: args.locationId, qty: args.qty },
      ],
    },
    { values: { operationAt: ['Date'] } },
  );
  const id = String(created.id);
  await trpcMutation(page, 'inbound.submit', { id });
  await trpcMutation(page, 'inbound.audit', { id });
  return id;
}

// ============================================================================
// Specs
// ============================================================================

test.describe('报表 dashboard (/inv/reports)', () => {
  test('dashboard 渲染 8 个 KPI 卡片，每个卡片有非空文本', async ({ page }) => {
    await page.goto('/inv/reports');

    // queries finish → 商品总数 KPI shows a value (not the placeholder '-')
    const goodsCount = page.getByTestId('card-goodsCount');
    await expect(goodsCount).toBeVisible();
    await expect(goodsCount).not.toContainText('-', { timeout: 10_000 });

    const ids = [
      'card-goodsCount',
      'card-activeWarehouseCount',
      'card-totalStockOnHand',
      'card-lowStockCount',
      'card-inboundCount',
      'card-outboundCount',
      'card-transferCount',
      'card-stocktakeCount',
    ] as const;

    for (const id of ids) {
      const card = page.getByTestId(id);
      await expect(card).toBeVisible();
      const text = (await card.innerText()).trim();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test('TOP 商品表：seed 一个 totalIn=150 的商品后，刷新可看到对应行', async ({ page }) => {
    const stamp = `${Date.now()}`.slice(-9);
    await page.goto('/');

    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);

    // 1) Seed goods via UI (the working one) — 1 商品.
    const goodsId = await seedGoodsViaUI(page, `R${stamp}`);

    // 2) Pre-fund 100 via inbound API.
    await seedAuditedInbound(page, {
      goodsId, operatorId, warehouseId, locationId,
      qty: '100', sourceDocNo: `PO-R${stamp}-A`,
    });

    // 3) Another inbound for 50 → totalIn = 150.
    await seedAuditedInbound(page, {
      goodsId, operatorId, warehouseId, locationId,
      qty: '50', sourceDocNo: `PO-R${stamp}-B`,
    });

    // 4) Open dashboard (defaults to last 30 days incl. today) and refresh.
    await page.goto('/inv/reports');
    // Wait first KPI to settle so initial query batch is done before refresh.
    await expect(page.getByTestId('card-goodsCount')).not.toContainText('-', {
      timeout: 10_000,
    });

    // refreshAll() bumps a nonce + calls refetch() on each query. Because
    // react-query may have cached responses prior to seeding (the first goto
    // raced with the seed mutations), we click refresh and then assert on the
    // row directly with a generous expect.toBeVisible timeout. This avoids
    // tying the test to httpBatchLink batching/coalescing details.
    await page.getByTestId('btn-refresh').click();

    const table = page.getByTestId('table-top-goods');
    await expect(table).toBeVisible();

    const row = page.getByTestId(`row-top-goods-${goodsId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('150');
  });
});
