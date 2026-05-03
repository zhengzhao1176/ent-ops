import { test, expect, type Page, type Response } from '@playwright/test';

// ============================================================================
// Helpers
// ============================================================================

// Auto-accept any window.confirm() dialog the inbound detail page raises.
function autoAcceptDialogs(page: Page) {
  page.on('dialog', (d) => { void d.accept(); });
}

// Encode tRPC GET query input. trpc httpBatchLink uses ?input=<encoded JSON>&batch=1
// where the JSON is `{ "0": { json, meta? } }`.
function trpcGetUrl(path: string, json: unknown, meta?: unknown): string {
  const inner: Record<string, unknown> = { json };
  if (meta) inner.meta = meta;
  const wrapped = { '0': inner };
  return `/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(wrapped))}&batch=1`;
}

// Run a tRPC GET (query) from inside the browser page so that the same cookies
// the React app uses (including secure cookies on HTTP localhost) get attached.
// page.request / APIRequestContext drops secure cookies on HTTP; the in-page
// fetch uses the browser's cookie jar.
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

// Run a tRPC POST (mutation), also via in-page fetch.
// Returns { ok, status, json } so callers can either assert success OR detect
// expected failures (e.g., illegal state-machine transitions).
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

// Read a tRPC response body and pull `id` out of the first batch result.
async function readIdFromTrpcResponse(res: Response): Promise<string> {
  const body = (await res.json()) as Array<{
    result?: { data?: { json?: { id?: string | number } } };
  }>;
  const id = body?.[0]?.result?.data?.json?.id;
  if (id == null) throw new Error('tRPC response missing json.id: ' + JSON.stringify(body));
  return String(id);
}

// Resolve seeded prerequisite IDs (warehouse / location) and the current admin user ID.
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

// Seed a brand-new goods record via UI (uses pre-seeded category+unit).
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

// Seed an inbound draft (status=10) directly via tRPC API. Used because the
// /inv/inbound/new UI form is currently blocked by a `goods.list pageSize=500`
// request that exceeds the contract max of 200, so the goods dropdown stays
// empty. See the "failure card" notes below for the bug detail.
async function seedInboundDraftViaApi(
  page: Page,
  args: {
    goodsId: string; operatorId: string; warehouseId: string;
    locationId: string; qty?: string; sourceDocNo?: string;
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
        { goodsId: args.goodsId, locationId: args.locationId, qty: args.qty ?? '100' },
      ],
    },
    { values: { operationAt: ['Date'] } },
  );
  return String(created.id);
}

// ============================================================================
// Specs
// ============================================================================

test.describe('采购入库 → 库存可见 (flow-purchase-inbound)', () => {
  test('flow-purchase-inbound 正向：建商品→建入库草稿→提交→审核→库存可见', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now()}`.slice(-9);

    // Visit any authenticated page first so the session cookie is bound to the
    // browsing context (we issue further fetch() calls via page.evaluate).
    await page.goto('/');

    // 1) Resolve seeded warehouse / location / operator IDs.
    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);
    // 2) Seed a fresh goods record through the UI (this UI works fine).
    const goodsId = await seedGoodsViaUI(page, stamp);

    // 3) ATTEMPT the new-inbound UI flow per flows.json. The /inv/inbound/new
    //    page currently sends `goods.list pageSize=500` which exceeds the
    //    Pagination contract max=200, so the goods dropdown is empty and the
    //    form cannot be completed. We try anyway so this test reveals the
    //    blocker; if the dropdown ever populates the full UI flow runs.
    await page.goto('/inv/inbound/new');
    await page.getByTestId('select-kind').selectOption('PURCHASE');
    await page.getByTestId('input-sourceDocNo').fill(`PO-${stamp}`);
    await page.getByTestId('select-warehouseId').selectOption({ index: 1 });

    const goodsSelect = page.getByTestId('select-line0-goods');
    const goodsOption = goodsSelect.locator(`option[value="${goodsId}"]`);
    // The assertion below is the actual bug-revealing one for the new-inbound page.
    await expect(goodsOption).toHaveCount(1, {
      // Tightened message for the failure card / runner.
      // If this fails: page sends invalid pageSize=500, see failure card #1.
    });

    await goodsSelect.selectOption(goodsId);
    await page.getByTestId('select-line0-location').selectOption({ index: 1 });
    await page.getByTestId('input-line0-qty').fill('100');

    const createPromise = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/inbound.create') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    const createResp = await createPromise;
    expect(createResp.ok()).toBe(true);
    await expect(page.getByTestId('success-msg')).toContainText('草稿已保存');
    const inboundId = await readIdFromTrpcResponse(createResp);

    // 4) Drive 10→20→30 via the detail page. The detail page is currently
    //    broken too (BigInt passed to react-query useQuery key — JSON.stringify
    //    throws). If/when fixed, this drives state via the UI buttons.
    await page.goto(`/inv/inbound/${inboundId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('草稿');

    const submitPromise = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/inbound.submit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    expect((await submitPromise).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('待审核');

    const auditPromise = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/inbound.audit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-audit').click();
    expect((await auditPromise).ok()).toBe(true);
    await expect(page.getByTestId('success-msg')).toContainText('审核通过');
    await expect(page.getByTestId('badge-status')).toHaveText('已审核');

    // 5) Stock query: qtyOnHand should reflect +100. (stock UI page works.)
    await page.goto(`/inv/stock?goodsId=${goodsId}`);
    await page.getByTestId('select-goodsId').selectOption(goodsId);
    await page.getByTestId('btn-search').click();
    const stockTable = page.getByTestId('table-stock');
    await expect(stockTable).toBeVisible();
    // formatDec strips trailing zeros: "100" not "100.0000".
    await expect(stockTable.getByTestId('cell-qtyOnHand').first()).toHaveText('100');
  });

  test('flow-stock-log-visible：审核完成后 stock 与 stockLog 均生成对应记录', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now() + 1}`.slice(-9);
    await page.goto('/');

    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);
    const goodsId = await seedGoodsViaUI(page, stamp);

    // The /inv/inbound/new and /inv/inbound/[id] UIs are blocked by separate
    // bugs (see failure cards #1 and #2). To still get end-to-end validation
    // of the inventory mutation → stock → log pipeline, we drive
    // create → submit → audit through the inbound tRPC API directly. The
    // stock UI page is also blocked once a filter is applied (#3 bigint bug),
    // so qtyOnHand is verified via the stock.list API instead. No UI route
    // for stock-logs exists, so per task brief we may verify via stockLog.list.
    const inboundId = await seedInboundDraftViaApi(page, {
      goodsId, operatorId, warehouseId, locationId, qty: '50', sourceDocNo: `PO-${stamp}`,
    });
    await trpcMutation(page, 'inbound.submit', { id: inboundId });
    await trpcMutation(page, 'inbound.audit', { id: inboundId });

    // Verify qtyOnHand via stock.list API.
    const stock = await trpcQuery<{
      items: Array<{ goodsId: string; qtyOnHand: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const stockRow = stock.items.find((s) => String(s.goodsId) === goodsId);
    expect(stockRow).toBeTruthy();
    // formatDec strips trailing zeros: "50" not "50.0000".
    expect(stockRow!.qtyOnHand).toBe('50');

    // Verify stock-log row exists for this goods.
    const logs = await trpcQuery<{
      items: Array<{ changeType: string; qtyChange: string; goodsId: string }>;
    }>(page, 'stockLog.list', { page: 1, pageSize: 20, goodsId });
    expect(logs.items.length).toBeGreaterThan(0);
    const hasInboundLog = logs.items.some(
      (i) => String(i.goodsId) === goodsId && (i.changeType === 'INBOUND' || i.qtyChange === '50'),
    );
    expect(hasInboundLog).toBe(true);
  });

  test('反例：在 status=10 草稿上跳过 submit 直接 audit 应被状态机阻止', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now() + 2}`.slice(-9);
    await page.goto('/');

    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);
    const goodsId = await seedGoodsViaUI(page, stamp);

    // Seed a draft inbound (status=10).
    const inboundId = await seedInboundDraftViaApi(page, {
      goodsId, operatorId, warehouseId, locationId, qty: '1', sourceDocNo: `PO-${stamp}`,
    });

    // Calling inbound.audit directly on a 10 (草稿) — legal target requires 20
    // (待审核) — must error.  The detail page UI cannot be used here because
    // /inv/inbound/[id] currently throws a client-side exception (BigInt in
    // react-query queryKey). We assert the contract-level guard instead.
    const r = await trpcMutationRaw(page, 'inbound.audit', { id: inboundId });
    expect(r.ok).toBe(false);
    // tRPC returns 4xx for business-rule errors; assert status is in error range.
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    // Also confirm the doc is still in 状态=10 (no side effects).
    const detail = await trpcQuery<{ status: number }>(page, 'inbound.detail', { id: inboundId });
    expect(detail.status).toBe(10);
  });
});
