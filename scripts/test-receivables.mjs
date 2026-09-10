import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../dist/infrastructure/database/prisma/prisma.service.js';
import { DocumentSequenceService } from '../dist/infrastructure/database/prisma/document-sequence.service.js';
import { InventoryStockService } from '../dist/infrastructure/database/prisma/inventory-stock.service.js';
import { ExportsService } from '../dist/modules/exports/services/exports.service.js';
import { PaymentsService } from '../dist/modules/exports/services/payments.service.js';
import { CustomersService } from '../dist/modules/customers/customers.service.js';
// Intentionally fixed to a dedicated local test database. Never reads .env/prod.
const url = 'postgresql://hvg_test:hvg_local_test_only@127.0.0.1:55439/hvg_test_verified?schema=fish_erp';
const prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
const exports = new ExportsService(prisma, new DocumentSequenceService(), new InventoryStockService());
const payments = new PaymentsService(prisma, exports);
const customers = new CustomersService(prisma, exports);
const actor = randomUUID();
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS', name); }
try {
  await prisma.$connect();
  const customer = await customers.create({ name: 'Khách thử HVG', phoneNumber: '090' + String(Date.now()).slice(-7), address: 'Địa chỉ ban đầu' }, actor);
  const product = await prisma.product.create({ data: { productCode: 'TEST-' + randomUUID(), productName: 'Sản phẩm thử HVG', productPrice: '100.10', remainingQuantity: 100, productUnit: 'chai' } });
  const input = { customerId: customer.id, items: [{ productId: product.id, exportQuantity: 10 }] };
  let invoice;
  await check('completed export has exact decimal debt and initial payment', async () => { invoice = await exports.create({ ...input, paidAmount: 100.25 }, actor); assert.equal(invoice.totalAmount, 1001); assert.equal(invoice.outstandingAmount, 900.75); assert.equal(invoice.payments.length, 1); });
  await check('guest debt rejected with no stock or invoice mutation', async () => { const before = await prisma.exportInvoice.count(); await assert.rejects(exports.create({ items: input.items, paidAmount: 0 }, actor)); assert.equal(await prisma.exportInvoice.count(), before); assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).remainingQuantity, 90); });
  await check('guest defaults to fully paid', async () => { const guest = await exports.create({ items: [{ productId: product.id, exportQuantity: 1 }] }, actor); assert.equal(guest.outstandingAmount, 0); assert.equal(guest.paidAmount, 100.1); });
  await check('concurrent same request only collects once', async () => { const p = { amount: 100, idempotencyKey: randomUUID(), note: 'chuyển khoản' }; await Promise.all([payments.add(invoice.id,p,actor), payments.add(invoice.id,p,actor)]); const updated = await exports.findById(invoice.id); assert.equal(updated.paidAmount, 200.25); assert.equal(updated.payments.length,2); await assert.rejects(payments.add(invoice.id,{ ...p, amount: 101 },actor)); });
  await check('concurrent different requests cannot overcollect', async () => { const results = await Promise.allSettled([payments.add(invoice.id,{ amount: 500, idempotencyKey: randomUUID() },actor),payments.add(invoice.id,{ amount: 500, idempotencyKey: randomUUID() },actor)]); assert.equal(results.filter(r => r.status === 'fulfilled').length,1); assert.equal((await exports.findById(invoice.id)).outstandingAmount,300.75); });
  await check('cannot cancel or delete a paid completed invoice', async () => { await assert.rejects(exports.cancel(invoice.id,actor)); await assert.rejects(exports.delete(invoice.id,actor)); });
  await check('customer rename preserves invoice identity snapshots', async () => { await customers.update(customer.id,{ name: 'Tên khách đã sửa' },actor); assert.equal((await exports.findById(invoice.id)).customerName,'Khách thử HVG'); });
  await check('customer debt aggregate, normalized duplicate and debt filter', async () => { const list = await customers.list({ page: 1, limit: 20, search: customer.phoneNumber, debtOnly: 'true' }); assert.equal(list.data[0].outstandingAmount,300.75); await assert.rejects(customers.create({ name: 'Trùng',phoneNumber: '+84' + customer.phoneNumber.slice(1) },actor)); });
  await check('reversal is audited and idempotent', async () => { const before = await exports.findById(invoice.id); const p = before.payments.find(p => p.amount === 500); await payments.reverse(invoice.id,p.id,{ reason: 'Thu nhầm' },actor); await payments.reverse(invoice.id,p.id,{ reason: 'Thu nhầm' },actor); const after = await exports.findById(invoice.id); assert.equal(after.outstandingAmount,800.75); assert.equal(after.payments.find(x => x.id === p.id).reversalReason,'Thu nhầm'); });
  await check('reverse all and cancel restores stock exactly once', async () => { const beforeStock = (await prisma.product.findUnique({ where: { id: product.id } })).remainingQuantity; const current = await exports.findById(invoice.id); for (const p of current.payments.filter(p => !p.reversedAt)) await payments.reverse(invoice.id,p.id,{ reason: 'Hoàn hàng' },actor); await Promise.all([exports.cancel(invoice.id,actor),exports.cancel(invoice.id,actor)]); assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).remainingQuantity,beforeStock+10); assert.equal((await exports.findById(invoice.id)).outstandingAmount,null); });
  await check('draft has no payments; completing twice posts only once', async () => { const draft = await exports.create({ ...input, paidAmount: 0, exportStatus: 'EDITING' },actor); assert.equal(draft.payments.length,0); assert.equal(draft.outstandingAmount,null); await Promise.all([exports.complete(draft.id,actor),exports.complete(draft.id,actor)]); assert.equal((await exports.findById(draft.id)).outstandingAmount,1001); assert.equal(await prisma.inventoryMovement.count({ where: { documentId: draft.id } }),1); });
  await check('legacy unknown requires explicit reconciliation including zero-paid audit', async () => { const legacy = await exports.create({ ...input, paidAmount: 0 },actor); await prisma.exportInvoice.update({ where: { id: legacy.id },data: { paymentTracked: false, customerId: null } }); assert.equal((await exports.findById(legacy.id)).paymentStatus,'UNKNOWN'); await assert.rejects(payments.add(legacy.id,{ amount: 1,idempotencyKey: randomUUID() },actor)); await assert.rejects(payments.reconcile(legacy.id,{ paidAmount: 0,note: 'Thiếu khách' },actor)); const reconciled = await payments.reconcile(legacy.id,{ customerId: customer.id,paidAmount: 0,note: 'Đối soát sổ khách' },actor); assert.equal(reconciled.outstandingAmount,1001); assert.equal(reconciled.reconciliationNote,'Đối soát sổ khách'); await assert.rejects(payments.reconcile(legacy.id,{ paidAmount: 0,note:'lặp' },actor)); });
  await check('archive preserves history and rejects new sales to archived customer', async () => { await customers.update(customer.id,{ archived: true },actor); await assert.rejects(exports.create(input,actor)); const detail = await customers.detail(customer.id,{ page:1,limit:10 }); assert.ok(detail.invoices.length); await customers.update(customer.id,{ archived: false },actor); });
  console.log(`Receivables integration: ${passed} scenarios passed`);
} finally { await prisma.$disconnect(); }
