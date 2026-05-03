import { test, expect, type Page, type Response } from '@playwright/test';

// ============================================================================
// Helpers (mirrors inbound.admin.spec.ts / outbound.admin.spec.ts; kept
// inline so each spec file is self-contained.)
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
// the current admin user ID. WH-MAIN acts as the FROM warehouse for transfer.
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

// Create a fresh "destination" warehouse + location pair via tRPC API. The
// seed only ships a single warehouse (WH-MAIN), but transfer requires a
// distinct from/to pair, so each test sets up its own destination.
async function seedDestinationViaApi(
  page: Page, codeSuffix: string,
): Promise<{ warehouseId: string; locationId: string }> {
  const wh = await trpcMutation<{ id: string }>(
    page,
    'warehouse.create',
    {
      code: `WH-DEST-${codeSuffix}`,
      name: `调入仓-${codeSuffix}`,
      kind: 'FINISHED',
    },
  );
  const loc = await trpcMutation<{ id: string }>(
    page,
    'location.create',
    {
      warehouseId: String(wh.id),
      code: `LOC-B1-${codeSuffix}`,
      name: `调入库位-${codeSuffix}`,
    },
  );
  return { warehouseId: String(wh.id), locationId: String(loc.id) };
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

// Drive the /inv/transfer/new UI form to create a transfer draft. Returns
// the new transfer id (status=10) parsed out of the create-mutation response.
//
// Note: the new-transfer page redirects to `/inv/transfer` (list page) ~500ms
// after a successful create — we capture the response *before* the navigation
// settles so the id is read deterministically.
async function createTransferViaUI(
  page: Page,
  args: {
    kind?: 'INTERNAL' | 'RETURN' | 'ADJUSTMENT';
    fromWarehouseId: string; fromLocationId: string;
    toWarehouseId: string; toLocationId: string;
    goodsId: string; qty: string; reason?: string;
  },
): Promise<string> {
  await page.goto('/inv/transfer/new');
  await page.getByTestId('select-kind').selectOption(args.kind ?? 'INTERNAL');
  await page.getByTestId('select-fromWarehouseId').selectOption(args.fromWarehouseId);
  // From-location options are gated on from-warehouse selection; wait for it.
  const fromLocSel = page.getByTestId('select-fromLocationId');
  await expect(fromLocSel.locator(`option[value="${args.fromLocationId}"]`)).toHaveCount(1);
  await fromLocSel.selectOption(args.fromLocationId);

  await page.getByTestId('select-toWarehouseId').selectOption(args.toWarehouseId);
  const toLocSel = page.getByTestId('select-toLocationId');
  await expect(toLocSel.locator(`option[value="${args.toLocationId}"]`)).toHaveCount(1);
  await toLocSel.selectOption(args.toLocationId);

  if (args.reason !== undefined) {
    await page.getByTestId('input-reason').fill(args.reason);
  }

  const goodsSel = page.getByTestId('select-line0-goods');
  await expect(goodsSel.locator(`option[value="${args.goodsId}"]`)).toHaveCount(1);
  await goodsSel.selectOption(args.goodsId);
  await page.getByTestId('input-line0-qty').fill(args.qty);

  const createPromise = page.waitForResponse(
    (r) => r.url().includes('/api/trpc/transfer.create') && r.request().method() === 'POST',
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

test.describe('调拨流程：调出仓出库 → 在途 → 调入仓收货 (flow-transfer)', () => {
  test('正向：建商品→入库100→新建调拨30→submit→audit→receive→finish→库存可见', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now()}`.slice(-9);

    await page.goto('/');

    // 1) Resolve FROM (WH-MAIN/LOC-A1) and create a fresh destination.
    const { operatorId, warehouseId: fromWh, locationId: fromLoc } =
      await resolveSeedIds(page);
    const { warehouseId: toWh, locationId: toLoc } =
      await seedDestinationViaApi(page, `tr-pos-${stamp}`);

    // 2) Seed a goods record via the goods UI.
    const goodsId = await seedGoodsViaUI(page, `tr-pos-${stamp}`);

    // 3) Pre-fund FROM stock with 100 of this goods at WH-MAIN/LOC-A1.
    await fundStockViaInboundApi(page, {
      goodsId, operatorId, warehouseId: fromWh, locationId: fromLoc,
      qty: '100', sourceDocNo: `PO-TR-${stamp}`,
    });

    // Sanity: FROM has qtyOnHand=100 and TO slot does not yet exist.
    const stockBefore = await trpcQuery<{
      items: Array<{ warehouseId: string; goodsId: string; qtyOnHand: string; qtyInTransit: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const fromBefore = stockBefore.items.find(
      (s) => String(s.warehouseId) === fromWh && String(s.goodsId) === goodsId,
    );
    expect(fromBefore).toBeTruthy();
    expect(fromBefore!.qtyOnHand).toBe('100');
    const toBefore = stockBefore.items.find(
      (s) => String(s.warehouseId) === toWh && String(s.goodsId) === goodsId,
    );
    expect(toBefore).toBeFalsy();

    // 4) Create a transfer draft via UI for qty=30.
    const transferId = await createTransferViaUI(page, {
      kind: 'INTERNAL',
      fromWarehouseId: fromWh, fromLocationId: fromLoc,
      toWarehouseId: toWh, toLocationId: toLoc,
      goodsId, qty: '30', reason: 'test',
    });

    // 5) Drive 10→20→25→30→40 via the detail page.
    // The new-transfer page redirects to the list page; navigate directly.
    await page.goto(`/inv/transfer/${transferId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('草稿');

    // 10 → 20 (submit, pure status flip).
    const submitResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/transfer.submit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    expect((await submitResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('待审核');

    // 20 → 25 (audit: subOnHand on FROM, addInTransit on TO, TRANSFER_OUT log).
    const auditResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/transfer.audit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-audit').click();
    expect((await auditResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('已发出');

    // After audit: FROM qtyOnHand should be 70 and TO qtyInTransit should be 30.
    const stockMid = await trpcQuery<{
      items: Array<{ warehouseId: string; goodsId: string; qtyOnHand: string; qtyInTransit: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const fromMid = stockMid.items.find(
      (s) => String(s.warehouseId) === fromWh && String(s.goodsId) === goodsId,
    );
    expect(fromMid).toBeTruthy();
    expect(fromMid!.qtyOnHand).toBe('70');
    const toMid = stockMid.items.find(
      (s) => String(s.warehouseId) === toWh && String(s.goodsId) === goodsId,
    );
    expect(toMid).toBeTruthy();
    expect(toMid!.qtyInTransit).toBe('30');
    expect(toMid!.qtyOnHand).toBe('0');

    // 25 → 30 (receive: addOnHand on TO, drain in-transit, TRANSFER_IN log).
    const receiveResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/transfer.receive') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-receive').click();
    expect((await receiveResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('已收货');

    // After receive: TO qtyOnHand=30, qtyInTransit=0; FROM stays at 70.
    const stockAfter = await trpcQuery<{
      items: Array<{ warehouseId: string; goodsId: string; qtyOnHand: string; qtyInTransit: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const fromAfter = stockAfter.items.find(
      (s) => String(s.warehouseId) === fromWh && String(s.goodsId) === goodsId,
    );
    expect(fromAfter!.qtyOnHand).toBe('70');
    const toAfter = stockAfter.items.find(
      (s) => String(s.warehouseId) === toWh && String(s.goodsId) === goodsId,
    );
    expect(toAfter).toBeTruthy();
    expect(toAfter!.qtyOnHand).toBe('30');
    expect(toAfter!.qtyInTransit).toBe('0');

    // 30 → 40 (finish: pure status flip).
    const finishResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/transfer.finish') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-finish').click();
    expect((await finishResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('已完成');

    // 6) Verify FROM stock = 70 via the stock UI.
    await page.goto(`/inv/stock?goodsId=${goodsId}`);
    await page.getByTestId('select-warehouseId').selectOption(fromWh);
    await page.getByTestId('select-goodsId').selectOption(goodsId);
    await page.getByTestId('btn-search').click();
    const stockTableFrom = page.getByTestId('table-stock');
    await expect(stockTableFrom).toBeVisible();
    await expect(stockTableFrom.getByTestId('cell-qtyOnHand').first()).toHaveText('70');

    // Verify TO stock = 30 via the stock UI.
    await page.goto(`/inv/stock?goodsId=${goodsId}`);
    await page.getByTestId('select-warehouseId').selectOption(toWh);
    await page.getByTestId('select-goodsId').selectOption(goodsId);
    await page.getByTestId('btn-search').click();
    const stockTableTo = page.getByTestId('table-stock');
    await expect(stockTableTo).toBeVisible();
    await expect(stockTableTo.getByTestId('cell-qtyOnHand').first()).toHaveText('30');

    // 7) Verify stockLog has TRANSFER_OUT (-30) on FROM and TRANSFER_IN (+30) on TO.
    const fromLogs = await trpcQuery<{
      items: Array<{ changeType: string; qtyChange: string; warehouseId: string; goodsId: string }>;
    }>(page, 'stockLog.list', {
      page: 1, pageSize: 20, goodsId, warehouseId: fromWh,
    });
    const outLog = fromLogs.items.find(
      (i) => String(i.goodsId) === goodsId && i.changeType === 'TRANSFER_OUT',
    );
    expect(outLog).toBeTruthy();
    expect(outLog!.qtyChange).toBe('-30');

    const toLogs = await trpcQuery<{
      items: Array<{ changeType: string; qtyChange: string; warehouseId: string; goodsId: string }>;
    }>(page, 'stockLog.list', {
      page: 1, pageSize: 20, goodsId, warehouseId: toWh,
    });
    const inLog = toLogs.items.find(
      (i) => String(i.goodsId) === goodsId && i.changeType === 'TRANSFER_IN',
    );
    expect(inLog).toBeTruthy();
    expect(inLog!.qtyChange).toBe('30');
  });

  test('反例：源/目标仓库相同 — INVALID_TRANSFER_TARGET 阻止创建', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now() + 1}`.slice(-9);

    await page.goto('/');
    const { operatorId, warehouseId: fromWh, locationId: fromLoc } =
      await resolveSeedIds(page);
    const goodsId = await seedGoodsViaUI(page, `tr-same-${stamp}`);

    // Attempt transfer.create where fromWarehouseId === toWarehouseId.
    // The contract permits it (both are valid BigIntId), so the rejection
    // happens at the service layer with INVALID_TRANSFER_TARGET.
    const r = await trpcMutationRaw(
      page,
      'transfer.create',
      {
        kind: 'INTERNAL',
        fromWarehouseId: fromWh,
        fromLocationId: fromLoc,
        toWarehouseId: fromWh,        // same warehouse
        toLocationId: fromLoc,        // same location
        operatorId,
        operationAt: new Date().toISOString(),
        reason: 'same-wh-test',
        lines: [{ goodsId, qty: '5' }],
      },
      { values: { operationAt: ['Date'] } },
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(JSON.stringify(r.payload)).toContain('INVALID_TRANSFER_TARGET');
  });

  test('反例：审核时库存不足 — INSUFFICIENT_STOCK，状态停留在 20', async ({ page }) => {
    autoAcceptDialogs(page);
    const stamp = `${Date.now() + 2}`.slice(-9);

    await page.goto('/');
    const { operatorId, warehouseId: fromWh, locationId: fromLoc } =
      await resolveSeedIds(page);
    const { warehouseId: toWh, locationId: toLoc } =
      await seedDestinationViaApi(page, `tr-neg-${stamp}`);
    const goodsId = await seedGoodsViaUI(page, `tr-neg-${stamp}`);

    // Fund only 5 — far less than the 999 the transfer asks for.
    await fundStockViaInboundApi(page, {
      goodsId, operatorId, warehouseId: fromWh, locationId: fromLoc,
      qty: '5', sourceDocNo: `PO-TRNEG-${stamp}`,
    });

    // Create a transfer draft for qty=999 via UI (create itself does not
    // check stock; the precheck happens at audit per F-IM-05 design).
    const transferId = await createTransferViaUI(page, {
      kind: 'INTERNAL',
      fromWarehouseId: fromWh, fromLocationId: fromLoc,
      toWarehouseId: toWh, toLocationId: toLoc,
      goodsId, qty: '999', reason: 'short-stock',
    });

    // Submit the draft (10 → 20). Submit is a pure status flip.
    await page.goto(`/inv/transfer/${transferId}`);
    await expect(page.getByTestId('badge-status')).toHaveText('草稿');
    const submitResp = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/transfer.submit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-submit').click();
    expect((await submitResp).ok()).toBe(true);
    await expect(page.getByTestId('badge-status')).toHaveText('待审核');

    // Audit must fail with PRECONDITION_FAILED:INSUFFICIENT_STOCK.
    const auditFail = page.waitForResponse(
      (r) => r.url().includes('/api/trpc/transfer.audit') && r.request().method() === 'POST',
    );
    await page.getByTestId('btn-audit').click();
    const auditResp = await auditFail;
    expect(auditResp.ok()).toBe(false);
    expect(auditResp.status()).toBeGreaterThanOrEqual(400);

    // The detail page surfaces the server message in error-msg.
    await expect(page.getByTestId('error-msg')).toContainText('INSUFFICIENT_STOCK');

    // Status must remain 20 (no side-effects).
    await expect(page.getByTestId('badge-status')).toHaveText('待审核');
    const detail = await trpcQuery<{ status: number }>(
      page, 'transfer.detail', { id: transferId },
    );
    expect(detail.status).toBe(20);

    // Confirm the API also rejects directly with the correct error.
    const r = await trpcMutationRaw(page, 'transfer.audit', { id: transferId });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.payload)).toContain('INSUFFICIENT_STOCK');

    // FROM qtyOnHand still 5 (no deduction happened).
    const stockAfter = await trpcQuery<{
      items: Array<{ warehouseId: string; goodsId: string; qtyOnHand: string }>;
    }>(page, 'stock.list', { page: 1, pageSize: 20, goodsId });
    const fromSlot = stockAfter.items.find(
      (s) => String(s.warehouseId) === fromWh && String(s.goodsId) === goodsId,
    );
    expect(fromSlot).toBeTruthy();
    expect(fromSlot!.qtyOnHand).toBe('5');
  });
});
