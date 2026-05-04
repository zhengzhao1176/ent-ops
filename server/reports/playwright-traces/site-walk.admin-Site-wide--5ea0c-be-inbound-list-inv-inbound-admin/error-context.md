# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site-walk.admin.spec.ts >> Site-wide walker (clicks + inputs every interactive element) >> probe: inbound-list /inv/inbound
- Location: tests/e2e/site-walk.admin.spec.ts:158:9

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.getAttribute: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('select[data-testid]').nth(2)

```

# Page snapshot

```yaml
- 'heading "Application error: a client-side exception has occurred (see the browser console for more information)." [level=2] [ref=e4]'
```

# Test source

```ts
  20  |   name: string;
  21  |   // procedures whose business errors are EXPECTED if the walker fills bogus data
  22  |   expectedTrpcErrors?: string[];
  23  | }
  24  | 
  25  | const PAGES: PageProbe[] = [
  26  |   { path: '/', name: 'dashboard' },
  27  |   { path: '/admin/users', name: 'users-list' },
  28  |   { path: '/admin/users/new', name: 'users-new', expectedTrpcErrors: ['user.create'] },
  29  |   { path: '/inv/goods', name: 'goods-list' },
  30  |   { path: '/inv/goods/new', name: 'goods-new', expectedTrpcErrors: ['goods.create'] },
  31  |   { path: '/inv/stock', name: 'stock-query' },
  32  |   { path: '/inv/inbound', name: 'inbound-list' },
  33  |   { path: '/inv/inbound/new', name: 'inbound-new', expectedTrpcErrors: ['inbound.create'] },
  34  |   { path: '/inv/outbound', name: 'outbound-list' },
  35  |   { path: '/inv/outbound/new', name: 'outbound-new', expectedTrpcErrors: ['outbound.create'] },
  36  |   { path: '/inv/transfer', name: 'transfer-list' },
  37  |   { path: '/inv/transfer/new', name: 'transfer-new', expectedTrpcErrors: ['transfer.create'] },
  38  |   { path: '/inv/stocktake', name: 'stocktake-list' },
  39  |   { path: '/inv/stocktake/new', name: 'stocktake-new' },
  40  |   { path: '/inv/reports', name: 'reports' },
  41  | ];
  42  | 
  43  | // Nav links that exist in sidebar but may NOT have implementations — walker probes them
  44  | // to surface 404s as findings (not failures, since the user already knows these are unbuilt).
  45  | const NAV_PROBES = ['/admin/roles', '/admin/depts', '/admin/audit'];
  46  | 
  47  | const SAFE_CLICK_TIDS = ['btn-search', 'btn-refresh', 'btn-prev', 'btn-next', 'btn-cancel'];
  48  | 
  49  | function defaultForInput(tid: string, type: string | null): string {
  50  |   if (type === 'email') return `walker-${Date.now()}@x.com`;
  51  |   if (type === 'password') return 'Walker123!';
  52  |   if (type === 'date') return '2026-01-01';
  53  |   if (type === 'number') return '1';
  54  |   if (tid.includes('mobile')) return `139${String(Date.now()).slice(-8)}`;
  55  |   if (tid.includes('employeeNo')) return `W${String(Date.now()).slice(-6)}`;
  56  |   if (tid.includes('username')) return `walker${String(Date.now()).slice(-6)}`;
  57  |   if (tid.includes('qty')) return '1';
  58  |   if (tid.includes('Password')) return 'Walker123!';
  59  |   if (tid.includes('targetDocNo') || tid.includes('sourceDocNo')) return `WALK-${Date.now()}`;
  60  |   return `walker-${tid}`;
  61  | }
  62  | 
  63  | async function probeOnePage(page: Page, p: PageProbe | { path: string; name: string }) {
  64  |   const findings: string[] = [];
  65  |   const consoleErrors: string[] = [];
  66  |   const pageErrors: string[] = [];
  67  |   const failedRequests: string[] = [];
  68  |   const expectedTrpc = (p as PageProbe).expectedTrpcErrors ?? [];
  69  | 
  70  |   const consoleHandler = (msg: import('@playwright/test').ConsoleMessage) => {
  71  |     if (msg.type() === 'error') {
  72  |       const txt = msg.text();
  73  |       if (txt.includes('favicon') || txt.includes('Service Worker') || txt.includes('manifest.json')) return;
  74  |       consoleErrors.push(txt);
  75  |     }
  76  |   };
  77  |   const pageErrHandler = (err: Error) => pageErrors.push(err.message);
  78  |   const responseHandler = (resp: import('@playwright/test').Response) => {
  79  |     const u = resp.url();
  80  |     const s = resp.status();
  81  |     if (s < 400) return;
  82  |     if (s === 401 || s === 403) return; // expected sometimes
  83  |     // tRPC route returns 200 even on procedure errors (envelope), so 4xx/5xx here = real network/server fault
  84  |     if (u.includes('/api/trpc/') && expectedTrpc.some((p) => u.includes(p))) return;
  85  |     failedRequests.push(`${s} ${u.replace(/^https?:\/\/[^/]+/, '')}`);
  86  |   };
  87  | 
  88  |   page.on('console', consoleHandler);
  89  |   page.on('pageerror', pageErrHandler);
  90  |   page.on('response', responseHandler);
  91  | 
  92  |   try {
  93  |     const navResp = await page.goto(p.path, { waitUntil: 'domcontentloaded', timeout: 15000 });
  94  |     await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {});
  95  |     if (!navResp || navResp.status() >= 400) {
  96  |       findings.push(`navigate→ ${p.path} returned HTTP ${navResp?.status() ?? 'no-response'}`);
  97  |       return { findings, consoleErrors, pageErrors, failedRequests };
  98  |     }
  99  | 
  100 |     if (page.url().includes('/login') && p.path !== '/login') {
  101 |       findings.push(`unexpected redirect to /login from ${p.path} (session lost?)`);
  102 |     }
  103 | 
  104 |     // Fill inputs
  105 |     const inputs = await page.locator('input[data-testid]').all();
  106 |     for (const inp of inputs) {
  107 |       const tid = (await inp.getAttribute('data-testid')) ?? '';
  108 |       const type = await inp.getAttribute('type');
  109 |       const val = defaultForInput(tid, type);
  110 |       try {
  111 |         await inp.fill(val, { timeout: 1500 });
  112 |       } catch (e) {
  113 |         findings.push(`fill failed on input[data-testid=${tid}]: ${(e as Error).message.split('\n')[0]}`);
  114 |       }
  115 |     }
  116 | 
  117 |     // Pick first non-placeholder option of selects
  118 |     const selects = await page.locator('select[data-testid]').all();
  119 |     for (const sel of selects) {
> 120 |       const tid = (await sel.getAttribute('data-testid')) ?? '';
      |                              ^ Error: locator.getAttribute: Test timeout of 60000ms exceeded.
  121 |       try {
  122 |         const opts = await sel.locator('option').count();
  123 |         if (opts >= 2) await sel.selectOption({ index: 1 }, { timeout: 1500 });
  124 |       } catch (e) {
  125 |         findings.push(`selectOption failed on select[data-testid=${tid}]: ${(e as Error).message.split('\n')[0]}`);
  126 |       }
  127 |     }
  128 | 
  129 |     // Click safe buttons
  130 |     for (const pat of SAFE_CLICK_TIDS) {
  131 |       const btns = page.getByTestId(pat);
  132 |       const cnt = await btns.count();
  133 |       for (let i = 0; i < cnt; i++) {
  134 |         const btn = btns.nth(i);
  135 |         const enabled = await btn.isEnabled().catch(() => false);
  136 |         if (!enabled) continue;
  137 |         try {
  138 |           await btn.click({ timeout: 2000 });
  139 |           await page.waitForLoadState('load', { timeout: 3000 }).catch(() => {});
  140 |         } catch (e) {
  141 |           findings.push(`click failed on ${pat}[${i}]: ${(e as Error).message.split('\n')[0]}`);
  142 |         }
  143 |       }
  144 |     }
  145 |   } finally {
  146 |     page.off('console', consoleHandler);
  147 |     page.off('pageerror', pageErrHandler);
  148 |     page.off('response', responseHandler);
  149 |   }
  150 |   return { findings, consoleErrors, pageErrors, failedRequests };
  151 | }
  152 | 
  153 | test.describe('Site-wide walker (clicks + inputs every interactive element)', () => {
  154 |   test.setTimeout(60_000);
  155 |   const allReport: string[] = [];
  156 | 
  157 |   for (const p of PAGES) {
  158 |     test(`probe: ${p.name} ${p.path}`, async ({ page }) => {
  159 |       const r = await probeOnePage(page, p);
  160 |       const lines = [
  161 |         `── ${p.name} (${p.path}) ──`,
  162 |         `  inputs/selects/buttons interacted; status=${r.findings.length === 0 && r.consoleErrors.length === 0 && r.pageErrors.length === 0 && r.failedRequests.length === 0 ? '✓' : '✗'}`,
  163 |         ...r.findings.map((x) => `  • finding: ${x}`),
  164 |         ...r.consoleErrors.map((x) => `  • console.error: ${x.slice(0, 160)}`),
  165 |         ...r.pageErrors.map((x) => `  • pageerror: ${x.slice(0, 160)}`),
  166 |         ...r.failedRequests.map((x) => `  • net: ${x}`),
  167 |       ];
  168 |       console.log('\n' + lines.join('\n'));
  169 |       allReport.push(...lines);
  170 |       // Hard-fail only on JS exceptions; surface console/findings as warnings
  171 |       expect(r.pageErrors, `pageerror on ${p.name}`).toEqual([]);
  172 |     });
  173 |   }
  174 | 
  175 |   for (const path of NAV_PROBES) {
  176 |     test(`nav-probe: ${path}`, async ({ page }) => {
  177 |       const resp = await page.goto(path, { waitUntil: 'domcontentloaded' }).catch(() => null);
  178 |       const status = resp?.status() ?? 0;
  179 |       const url = page.url();
  180 |       const note = `${path} → HTTP ${status} (final URL ${url.replace(/^https?:\/\/[^/]+/, '')})`;
  181 |       console.log('\n── nav-probe: ' + note + ' ──');
  182 |       // 200 with redirect to login = sidebar links to a non-existent page yet works as 404? observe.
  183 |       // We don't fail; we just record.
  184 |       expect(status).toBeGreaterThanOrEqual(0); // sentinel
  185 |     });
  186 |   }
  187 | 
  188 |   test('lifecycle: create + edit + soft-delete a goods', async ({ page }) => {
  189 |     const stamp = String(Date.now()).slice(-9);
  190 |     const code = `WG-${stamp}`;
  191 |     const name = `WalkerGoods-${stamp}`;
  192 | 
  193 |     await page.goto('/inv/goods/new');
  194 |     await page.getByTestId('input-code').fill(code);
  195 |     await page.getByTestId('input-name').fill(name);
  196 |     await page.getByTestId('select-categoryId').selectOption({ index: 1 });
  197 |     await page.getByTestId('select-unitId').selectOption({ index: 1 });
  198 |     const createResp = page.waitForResponse((r) => r.url().includes('/api/trpc/goods.create'));
  199 |     await page.getByTestId('btn-submit').click();
  200 |     expect((await createResp).ok()).toBe(true);
  201 |     await page.waitForURL(/\/inv\/goods$/);
  202 | 
  203 |     // Find the row, click edit
  204 |     await page.getByTestId('input-search').fill(code);
  205 |     await page.getByTestId('btn-search').click();
  206 |     const row = page.getByTestId(/^row-goods-/).first();
  207 |     await expect(row).toContainText(code);
  208 | 
  209 |     // Soft-delete via in-row button if present, else go to detail and back
  210 |     const deleteBtn = row.getByTestId('btn-delete');
  211 |     if ((await deleteBtn.count()) > 0) {
  212 |       page.once('dialog', (d) => d.accept());
  213 |       await deleteBtn.click();
  214 |     }
  215 |   });
  216 | 
  217 |   test('summary: print all collected findings', async () => {
  218 |     if (allReport.length > 0) {
  219 |       console.log('\n\n═══════════════════════ SITE WALKER REPORT ═══════════════════════');
  220 |       console.log(allReport.join('\n'));
```