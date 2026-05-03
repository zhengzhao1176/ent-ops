import { test, expect, type Page, type Response } from '@playwright/test';

// ============================================================================
// Helpers (mirrors inbound.admin.spec.ts; kept inline to avoid a new dep file)
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

// Create a brand-new goods row through the goods/new UI (uses pre-seeded
// CAT-DEFAULT category + UNIT-PCS unit).  Returns the new goods id.
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

// Fund stock for a (warehouse, location, goods) tuple by running a full
// purchase-inbound: create draft → submit → audit. After audit, qtyOnHand
// for that slot is increased by `qty`. We use the inbound tRPC API directly
// because driving the inbound UI inside this spec would only retest inbound.
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

// Create an outbound draft via the /inv/outbound/new UI form.  Returns the
// new outbound id (status=10) parsed out of the create-mutation response.
//
// Note: the new-outbound page redirects to `/inv/outbound` (list page) ~500ms
// after a successful create — we capture the response *before* the navigation
// settles so the id is read deterministically.
async function createOutboundViaUI(
  page: Page,
  args: {
    goodsId: string; locationId: string; warehouseId: string;
    qty: string; targetDocNo: string;
  },
): Promise<string> {
  await page.goto('/inv/outbound/new');
  await page.getByTestId('select-kind').selectOption('SALES');
  await page.getByTestId('select-warehouseId').selectOption(args.warehouseId);
  await page.getByTestId('select-pickStrategy').selectOption('FIFO');
  await page.getByTestId('input-targetDocNo').fill(args.targetDocNo);
  // Locations are gated on warehouse selection; wait until the option exists.
  const locSelect = page.getByTestId('select-line0-location');
  await expect(locSelect.locator(`option[value="${args.locationId}"]`)).toHaveCount(1);
  await page.getByTestId('select-line0-goods').selectOption(args.goodsId);
  await locSelect.selectOption(args.locationId);
  await page.getByTestId('input-line0-qty').fill(args.qty);

  const createPromise = page.waitForResponse(
    (r) => r.url().includes('/api/trpc/outbound.create') && r.request().method() === 'POST',
  );
  await page.getByTestId('btn-submit').click();
  const resp = await createPromise;
  expect(resp.ok()).toBe(true);
  await expect(page.getByTestId('success-msg')).toContainText('草稿已保存');
  return await readIdFromTrpcResponse(resp);
}

// ============================================================================
// Specs
// ============================================================================

test.describe('销售出库 → 库存扣减 (flow-sales-outbound)', () => {
  test('正向：建商品→入库100→新建出库20→提交→审核→发货→库存扣减为80', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now()}`.slice(-9);

    await page.goto('/');
    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);
    const goodsId = await seedGoodsViaUI(page, `ob-pos-${stamp}`);

    // Pre-fund stock: 100 of this goods at WH-MAIN/LOC-A1.
    await fundStockViaInboundApi(page, {
      goodsId, operatorId, warehouseId, locationId,
      qty: '100', sourceDocNo: `PO-OB-${stamp}`,
    });

    // Sanity: stock.list reports qtyOnHand=100, qtyAvailable=100.
    const stockBefore = await trpcQuery<{
      items: Array<{ goodsId: string; qtyOnHand: string; qtyAvailable: string; qtyLocked: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const slotBefore = stockBefore.items.find((s) => String(s.goodsId) === goodsId);
    expect(slotBefore).toBeTruthy();
    expect(slotBefore!.qtyOnHand).toBe('100');
    expect(slotBefore!.qtyAvailable).toBe('100');

    // Create outbound draft via UI for qty=20.
    const outboundId = await createOutboundViaUI(page, {
      goodsId, locationId, warehouseId,
      qty: '20', targetDocNo: `SO-${stamp}`,
    });

    // Drive the state machine via the detail page.
    await page.goto(`/inv/outbound/${outboundId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('草稿');

    // 10 → 20 (submit, performs total-availability precheck).
    const submitResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/outbound.submit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    expect((await submitResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('待审核');

    // 20 → 25 (audit, locks 20 from qtyAvailable).
    const auditResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/outbound.audit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-audit').click();
    expect((await auditResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('待发货');

    // After audit: qtyLocked should reflect 20 and qtyAvailable should be 80.
    const stockMid = await trpcQuery<{
      items: Array<{ goodsId: string; qtyOnHand: string; qtyAvailable: string; qtyLocked: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const slotMid = stockMid.items.find((s) => String(s.goodsId) === goodsId);
    expect(slotMid).toBeTruthy();
    expect(slotMid!.qtyLocked).toBe('20');
    expect(slotMid!.qtyAvailable).toBe('80');
    // qtyOnHand still 100 — physical stock not yet shipped.
    expect(slotMid!.qtyOnHand).toBe('100');

    // 25 → 30 (ship, deducts qtyOnHand and releases the lock).
    const shipResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/outbound.ship') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-ship').click();
    expect((await shipResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('已发货');

    // Verify qtyOnHand is now 80 via the stock UI.
    await page.goto(`/inv/stock?goodsId=${goodsId}`);
    await page.getByTestId('select-goodsId').selectOption(goodsId);
    await page.getByTestId('btn-search').click();
    const stockTable = page.getByTestId('table-stock');
    await expect(stockTable).toBeVisible();
    // formatDec strips trailing zeros: "80" not "80.0000".
    await expect(stockTable.getByTestId('cell-qtyOnHand').first()).toHaveText('80');

    // Stock-log: an OUTBOUND entry with qty_change -20 should exist.
    const logs = await trpcQuery<{
      items: Array<{ changeType: string; qtyChange: string; goodsId: string }>;
    }>(page, 'stockLog.list', { page: 1, pageSize: 20, goodsId });
    const outLog = logs.items.find(
      (i) => String(i.goodsId) === goodsId
        && (i.changeType === 'OUTBOUND' || i.qtyChange === '-20'),
    );
    expect(outLog).toBeTruthy();
  });

  test('反例：可用库存不足 — 提交时被 INSUFFICIENT_STOCK 阻止', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now() + 1}`.slice(-9);

    await page.goto('/');
    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);
    const goodsId = await seedGoodsViaUI(page, `ob-neg-${stamp}`);

    // Fund only 10 — far less than the 999999 the outbound asks for.
    await fundStockViaInboundApi(page, {
      goodsId, operatorId, warehouseId, locationId,
      qty: '10', sourceDocNo: `PO-OBNEG-${stamp}`,
    });

    // Create the draft via UI (create itself does not check stock; the
    // precheck happens on submit per outboundService.submit()).
    const outboundId = await createOutboundViaUI(page, {
      goodsId, locationId, warehouseId,
      qty: '999999', targetDocNo: `SO-NEG-${stamp}`,
    });

    // Trying to submit must fail with INSUFFICIENT_STOCK.  Assert two ways:
    //   1. Through the detail-page UI (button click → error-msg shown).
    //   2. Through the API (status 4xx + INSUFFICIENT_STOCK message).
    // The UI assertion is the user-facing one; the API assertion confirms the
    // error semantics regardless of how the page chooses to render the toast.
    await page.goto(`/inv/outbound/${outboundId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('草稿');

    const submitFail = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/outbound.submit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    const submitResp = await submitFail;
    expect(submitResp.ok()).toBe(false);
    expect(submitResp.status()).toBeGreaterThanOrEqual(400);
    expect(submitResp.status()).toBeLessThan(500);

    // The detail page surfaces the server message in the error-msg div.
    await expect(page.getByTestId('error-msg')).toContainText('INSUFFICIENT_STOCK');

    // And status remains 10 (no side effects).
    const detail = await trpcQuery<{ status: number }>(
      page, 'outbound.detail', { id: outboundId },
    );
    expect(detail.status).toBe(10);

    // Confirm the API rejects with the correct error message.
    const r = await trpcMutationRaw(page, 'outbound.submit', { id: outboundId });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.payload)).toContain('INSUFFICIENT_STOCK');
  });

  test('反例：非法状态迁移 — 提交后(20)直接发货应被状态机拒绝', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now() + 2}`.slice(-9);

    await page.goto('/');
    const { operatorId, warehouseId, locationId } = await resolveSeedIds(page);
    const goodsId = await seedGoodsViaUI(page, `ob-ill-${stamp}`);

    // Fund stock so submit() passes the availability precheck.
    await fundStockViaInboundApi(page, {
      goodsId, operatorId, warehouseId, locationId,
      qty: '50', sourceDocNo: `PO-OBILL-${stamp}`,
    });

    // Create draft (status=10) then submit it (10 → 20).
    const outboundId = await createOutboundViaUI(page, {
      goodsId, locationId, warehouseId,
      qty: '5', targetDocNo: `SO-ILL-${stamp}`,
    });
    await trpcMutation(page, 'outbound.submit', { id: outboundId });
    const after = await trpcQuery<{ status: number }>(
      page, 'outbound.detail', { id: outboundId },
    );
    expect(after.status).toBe(20);

    // UI assertion: on the detail page at status=20, btn-ship must be disabled
    // (canShip = status === 25 in the page; 20 → 30 skips the audit step).
    await page.goto(`/inv/outbound/${outboundId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('待审核');
    await expect(page.getByTestId('btn-ship')).toBeDisabled();
    await expect(page.getByTestId('btn-audit')).toBeEnabled();

    // API assertion: directly invoking outbound.ship at status=20 must error
    // with ILLEGAL_TRANSITION (or STATE_MISMATCH from the transition router;
    // ship() itself goes through tryTransition(20, 30)).
    const r = await trpcMutationRaw(page, 'outbound.ship', { id: outboundId });
    expect(r.ok).toBe(false);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    const errBody = JSON.stringify(r.payload);
    expect(errBody).toMatch(/ILLEGAL_TRANSITION|STATE_MISMATCH/);

    // Doc still in status=20 (no side effects).
    const detail = await trpcQuery<{ status: number }>(
      page, 'outbound.detail', { id: outboundId },
    );
    expect(detail.status).toBe(20);
  });
});
