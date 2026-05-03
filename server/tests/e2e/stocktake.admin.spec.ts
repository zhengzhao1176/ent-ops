import { test, expect, type Page, type Response } from '@playwright/test';

// ============================================================================
// Helpers (mirrors inbound.admin.spec.ts / transfer.admin.spec.ts; kept inline
// so each spec file is self-contained.)
// ============================================================================

// Auto-accept any window.confirm() dialog raised by detail-page state buttons.
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

// In-page fetch for tRPC GET so the React-app cookie jar is reused.
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

// Resolve seeded prerequisite IDs (WH-MAIN warehouse + LOC-A1 location) and
// the current admin user ID.
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

// Seed a brand-new goods record via the goods/new UI (uses seeded
// CAT-DEFAULT category + UNIT-PCS unit).
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

// Pre-fund stock by running a full purchase-inbound (create draft → submit
// → audit). After audit the (warehouse,location,goods) qtyOnHand is +qty.
// Uses the inbound tRPC API directly to avoid retesting inbound here.
async function fundStockViaInboundApi(
  page: Page,
  args: {
    goodsId: string; operatorId: string; warehouseId: string;
    locationId: string; qty: string; sourceDocNo: string;
  },
): Promise<void> {
  const created = await trpcMutation<{ id: string }>(
    page,
    'inbound.create',
    {
      kind: 'PURCHASE',
      sourceDocNo: args.sourceDocNo,
      warehouseId: args.warehouseId,
      operatorId: args.operatorId,
      operationAt: new Date().toISOString(),
      lines: [
        { goodsId: args.goodsId, locationId: args.locationId, qty: args.qty },
      ],
    },
    { values: { operationAt: ['Date'] } },
  );
  await trpcMutation(page, 'inbound.submit', { id: String(created.id) });
  await trpcMutation(page, 'inbound.audit', { id: String(created.id) });
}

// Drive the /inv/stocktake/new UI form to create a stocktake header (status=10).
// The page redirects to /inv/stocktake (list) ~500ms after success — we capture
// the response *before* the navigation settles so the id is read deterministically.
async function createStocktakeViaUI(
  page: Page,
  args: {
    kind?: 'FULL' | 'SAMPLING' | 'DYNAMIC';
    warehouseId: string;
    reason?: string;
    remark?: string;
  },
): Promise<string> {
  await page.goto('/inv/stocktake/new');
  await page.getByTestId('select-kind').selectOption(args.kind ?? 'FULL');
  const whSel = page.getByTestId('select-warehouseId');
  await expect(whSel.locator(`option[value="${args.warehouseId}"]`)).toHaveCount(1);
  await whSel.selectOption(args.warehouseId);
  if (args.reason !== undefined) {
    await page.getByTestId('input-reason').fill(args.reason);
  }
  if (args.remark !== undefined) {
    await page.getByTestId('input-remark').fill(args.remark);
  }

  const createPromise = page.waitForResponse(
    (r) => r.url().includes('/api/trpc/stocktake.create') && r.request().method() === 'POST',
  );
  await page.getByTestId('btn-submit').click();
  const resp = await createPromise;
  expect(resp.ok()).toBe(true);
  await expect(page.getByTestId('success-msg')).toContainText('草稿已保存');
  return await readIdFromTrpcResponse(resp);
}

// Resolve the stocktake.detail.lines array by hitting the API (lines testids
// embed the line id as a bigint string). Returns the array of line rows so
// the caller can pick the one matching our goodsId.
type StocktakeLine = {
  id: string;
  stocktakeId: string;
  goodsId: string;
  locationId: string;
  batchNo: string | null;
  bookQty: string;
  actualQty: string | null;
  difference: string | null;
  reason: string | null;
};
type StocktakeDetail = {
  id: string;
  docNo: string;
  status: number;
  gainDocNo: string | null;
  lossDocNo: string | null;
  lines: StocktakeLine[];
};
async function fetchStocktakeDetail(page: Page, id: string): Promise<StocktakeDetail> {
  return await trpcQuery<StocktakeDetail>(page, 'stocktake.detail', { id });
}

// ============================================================================
// Specs
// ============================================================================

test.describe('盘点流程：建单 → 冻结 → 录入实盘 → 提交 → 过账 (flow-stocktake)', () => {
  test('正向（盘盈）：建商品→入库100→建盘点→冻结→实盘103→submit→commit→生成盘盈单→库存=103', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now()}`.slice(-9);

    await page.goto('/');

    // 1) Resolve seeded IDs (WH-MAIN/LOC-A1) and admin operator.
    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);

    // 2) Seed a fresh goods record through the UI.
    const goodsId = await seedGoodsViaUI(page, `st-gain-${stamp}`);

    // 3) Pre-fund stock with 100 of this goods at WH-MAIN/LOC-A1.
    await fundStockViaInboundApi(page, {
      goodsId, operatorId, warehouseId, locationId,
      qty: '100', sourceDocNo: `PO-STG-${stamp}`,
    });

    // Sanity: stock starts at 100 in this slot.
    const stockBefore = await trpcQuery<{
      items: Array<{ warehouseId: string; goodsId: string; qtyOnHand: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const beforeRow = stockBefore.items.find(
      (s) => String(s.warehouseId) === warehouseId && String(s.goodsId) === goodsId,
    );
    expect(beforeRow).toBeTruthy();
    expect(beforeRow!.qtyOnHand).toBe('100');

    // 4) Create the stocktake header (status=10) via the new UI.
    const stocktakeId = await createStocktakeViaUI(page, {
      kind: 'FULL',
      warehouseId,
      reason: 'month-end count',
    });

    // 5) Drive 10 → 20 (freeze) via the detail page.
    // The new page redirects to /inv/stocktake (list); navigate directly to detail.
    await page.goto(`/inv/stocktake/${stocktakeId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('草稿');

    const freezeResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.freeze') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-freeze').click();
    expect((await freezeResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('录入中');

    // 6) Lines should be populated from the snapshot. Find the row for our goods.
    const detailFrozen = await fetchStocktakeDetail(page, stocktakeId);
    expect(detailFrozen.status).toBe(20);
    expect(detailFrozen.lines.length).toBeGreaterThan(0);
    const ourLine = detailFrozen.lines.find((l) => String(l.goodsId) === goodsId);
    expect(ourLine).toBeTruthy();
    expect(ourLine!.bookQty).toBe('100');
    const lineId = String(ourLine!.id);

    // The lines table should be visible and populated.
    await expect(page.getByTestId('table-stocktake-lines')).toBeVisible();
    await expect(page.getByTestId(`row-stocktake-line-${lineId}`)).toBeVisible();

    // 7) Fill actualQty=103 (gain of 3) and a reason, then save the line.
    await page.getByTestId(`input-line-${lineId}-actualQty`).fill('103');
    await page.getByTestId(`input-line-${lineId}-reason`).fill('盘盈3');
    const lineSaveResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.updateLineActual') &&
             r.request().method() === 'POST',
    );
    await page.getByTestId(`btn-line-${lineId}-save`).click();
    expect((await lineSaveResp).ok()).toBe(true);
    await expect(page.getByTestId('success-msg')).toContainText('明细已保存');

    // For any *other* lines that were captured by the FULL snapshot (none
    // expected on a fresh DB but defensively we set actualQty=bookQty so the
    // submit guard does not trip on missing-actual / missing-reason).
    for (const l of detailFrozen.lines) {
      if (String(l.id) === lineId) continue;
      await trpcMutation(page, 'stocktake.updateLineActual', {
        id: String(l.id),
        actualQty: l.bookQty,
      });
    }

    // 8) 20 → 25 (submit). The detail page raises a confirm() dialog —
    // autoAcceptDialogs handles it.
    const submitResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.submit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    expect((await submitResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('待审核');

    // 9) 25 → 30 (commit). This auto-creates+audits the 盘盈 inbound (+3).
    const commitResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.commit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-commit').click();
    expect((await commitResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('已过账');

    // 10) Assert gainDocNo set, lossDocNo unset.
    const detailCommitted = await fetchStocktakeDetail(page, stocktakeId);
    expect(detailCommitted.status).toBe(30);
    expect(detailCommitted.gainDocNo).toBeTruthy();
    expect(detailCommitted.gainDocNo!.length).toBeGreaterThan(0);
    expect(detailCommitted.lossDocNo).toBeFalsy();

    // The detail page renders the gain doc number (post-commit-only field).
    await expect(page.getByText(detailCommitted.gainDocNo!)).toBeVisible();

    // 11) Verify stock now shows 103 via the stock UI.
    await page.goto(`/inv/stock?goodsId=${goodsId}`);
    await page.getByTestId('select-warehouseId').selectOption(warehouseId);
    await page.getByTestId('select-goodsId').selectOption(goodsId);
    await page.getByTestId('btn-search').click();
    const stockTable = page.getByTestId('table-stock');
    await expect(stockTable).toBeVisible();
    await expect(stockTable.getByTestId('cell-qtyOnHand').first()).toHaveText('103');
  });

  test('正向（盘亏）：建商品→入库50→建盘点→冻结→实盘45→submit→commit→生成盘亏单→库存=45', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now() + 1}`.slice(-9);

    await page.goto('/');

    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);
    const goodsId = await seedGoodsViaUI(page, `st-loss-${stamp}`);

    // Pre-fund 50.
    await fundStockViaInboundApi(page, {
      goodsId, operatorId, warehouseId, locationId,
      qty: '50', sourceDocNo: `PO-STL-${stamp}`,
    });

    const stocktakeId = await createStocktakeViaUI(page, {
      kind: 'FULL',
      warehouseId,
      reason: 'loss test',
    });

    // 10 → 20 freeze.
    await page.goto(`/inv/stocktake/${stocktakeId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('草稿');
    const freezeResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.freeze') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-freeze').click();
    expect((await freezeResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('录入中');

    const detailFrozen = await fetchStocktakeDetail(page, stocktakeId);
    const ourLine = detailFrozen.lines.find((l) => String(l.goodsId) === goodsId);
    expect(ourLine).toBeTruthy();
    expect(ourLine!.bookQty).toBe('50');
    const lineId = String(ourLine!.id);

    // Enter actualQty=45 (loss of 5) with reason '盘亏5'.
    await page.getByTestId(`input-line-${lineId}-actualQty`).fill('45');
    await page.getByTestId(`input-line-${lineId}-reason`).fill('盘亏5');
    const lineSaveResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.updateLineActual') &&
             r.request().method() === 'POST',
    );
    await page.getByTestId(`btn-line-${lineId}-save`).click();
    expect((await lineSaveResp).ok()).toBe(true);
    await expect(page.getByTestId('success-msg')).toContainText('明细已保存');

    // Defensively zero-diff every other snapshot line.
    for (const l of detailFrozen.lines) {
      if (String(l.id) === lineId) continue;
      await trpcMutation(page, 'stocktake.updateLineActual', {
        id: String(l.id),
        actualQty: l.bookQty,
      });
    }

    // 20 → 25 submit.
    const submitResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.submit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    expect((await submitResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('待审核');

    // 25 → 30 commit. Auto-creates+ships the 盘亏 outbound (-5).
    const commitResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.commit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-commit').click();
    expect((await commitResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('已过账');

    // lossDocNo set, gainDocNo unset.
    const detailCommitted = await fetchStocktakeDetail(page, stocktakeId);
    expect(detailCommitted.status).toBe(30);
    expect(detailCommitted.lossDocNo).toBeTruthy();
    expect(detailCommitted.lossDocNo!.length).toBeGreaterThan(0);
    expect(detailCommitted.gainDocNo).toBeFalsy();
    await expect(page.getByText(detailCommitted.lossDocNo!)).toBeVisible();

    // Stock should now be 45.
    await page.goto(`/inv/stock?goodsId=${goodsId}`);
    await page.getByTestId('select-warehouseId').selectOption(warehouseId);
    await page.getByTestId('select-goodsId').selectOption(goodsId);
    await page.getByTestId('btn-search').click();
    const stockTable = page.getByTestId('table-stock');
    await expect(stockTable).toBeVisible();
    await expect(stockTable.getByTestId('cell-qtyOnHand').first()).toHaveText('45');
  });

  test('反例：差异非零但未填原因 — submit 报 MISSING_DIFFERENCE_REASON，状态停留在 20', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now() + 2}`.slice(-9);

    await page.goto('/');

    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);
    const goodsId = await seedGoodsViaUI(page, `st-noreason-${stamp}`);

    // Pre-fund 30.
    await fundStockViaInboundApi(page, {
      goodsId, operatorId, warehouseId, locationId,
      qty: '30', sourceDocNo: `PO-STNR-${stamp}`,
    });

    const stocktakeId = await createStocktakeViaUI(page, {
      kind: 'FULL',
      warehouseId,
      reason: 'no-reason test',
    });

    // 10 → 20 freeze.
    await page.goto(`/inv/stocktake/${stocktakeId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('草稿');
    const freezeResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.freeze') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-freeze').click();
    expect((await freezeResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('录入中');

    const detailFrozen = await fetchStocktakeDetail(page, stocktakeId);
    const ourLine = detailFrozen.lines.find((l) => String(l.goodsId) === goodsId);
    expect(ourLine).toBeTruthy();
    expect(ourLine!.bookQty).toBe('30');
    const lineId = String(ourLine!.id);

    // Enter actualQty=28 (diff=-2) but leave reason EMPTY. Save the line.
    await page.getByTestId(`input-line-${lineId}-actualQty`).fill('28');
    // Intentionally do NOT fill input-line-{lineId}-reason.
    const lineSaveResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.updateLineActual') &&
             r.request().method() === 'POST',
    );
    await page.getByTestId(`btn-line-${lineId}-save`).click();
    expect((await lineSaveResp).ok()).toBe(true);
    await expect(page.getByTestId('success-msg')).toContainText('明细已保存');

    // Defensively zero-diff every other snapshot line so that THIS line is
    // the only one driving the failure.
    for (const l of detailFrozen.lines) {
      if (String(l.id) === lineId) continue;
      await trpcMutation(page, 'stocktake.updateLineActual', {
        id: String(l.id),
        actualQty: l.bookQty,
      });
    }

    // Click submit — the API must reject with MISSING_DIFFERENCE_REASON.
    const submitFail = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/stocktake.submit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    const submitResp = await submitFail;
    expect(submitResp.ok()).toBe(false);
    expect(submitResp.status()).toBeGreaterThanOrEqual(400);
    expect(submitResp.status()).toBeLessThan(500);

    // The detail page surfaces the server message in error-msg.
    await expect(page.getByTestId('error-msg')).toContainText('MISSING_DIFFERENCE_REASON');

    // Status must remain 20 (no side-effects).
    await expect(page.getByTestId('badge-status')).toHaveText('录入中');
    const detailAfter = await fetchStocktakeDetail(page, stocktakeId);
    expect(detailAfter.status).toBe(20);
    expect(detailAfter.gainDocNo).toBeFalsy();
    expect(detailAfter.lossDocNo).toBeFalsy();

    // Confirm the API also rejects directly with the correct error code.
    const r = await trpcMutationRaw(page, 'stocktake.submit', { id: stocktakeId });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.payload)).toContain('MISSING_DIFFERENCE_REASON');

    // Stock must still be 30 (commit never ran).
    const stockAfter = await trpcQuery<{
      items: Array<{ warehouseId: string; goodsId: string; qtyOnHand: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const slot = stockAfter.items.find(
      (s) => String(s.warehouseId) === warehouseId && String(s.goodsId) === goodsId,
    );
    expect(slot).toBeTruthy();
    expect(slot!.qtyOnHand).toBe('30');

    // Cleanup: cancel the still-frozen stocktake (legal 20→90 transition) so
    // the warehouse-level freeze is released for any subsequent spec that
    // tries to inbound.audit on WH-MAIN. The test's assertion about the
    // failed submit is already complete; this is purely test housekeeping.
    const cancelResp = await trpcMutationRaw(page, 'stocktake.cancel', { id: stocktakeId });
    expect(cancelResp.ok).toBe(true);
    const detailCancelled = await fetchStocktakeDetail(page, stocktakeId);
    expect(detailCancelled.status).toBe(90);
  });
});
