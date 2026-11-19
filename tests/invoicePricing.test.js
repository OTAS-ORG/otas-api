const test = require('node:test');
const assert = require('node:assert/strict');
const Invoice = require('../models/Invoice');
const {
  roundMoney,
  normalizeDiscount,
  normalizeItem,
  computeGrandTotal,
  calculateInvoiceFields,
} = require('../utils/invoicePricing');

test('roundMoney rounds MMK to integer and USD to 2 decimals', () => {
  assert.equal(roundMoney(1234.6, 'MMK'), 1235);
  assert.equal(roundMoney(1234.456, 'USD'), 1234.46);
  assert.equal(roundMoney('not-a-number', 'MMK'), 0);
});

test('FOC item preserves originalAmount, sets amount to 0, and clears item discount', () => {
  const item = normalizeItem(
    {
      description: 'Domain Setup (1st Year)',
      originalAmount: 120000,
      isFoc: true,
      discountType: 'percent',
      discountValue: 20,
      discountReason: 'ignored',
    },
    'MMK'
  );

  assert.equal(item.isFoc, true);
  assert.equal(item.originalAmount, 120000);
  assert.equal(item.amount, 0);
  assert.equal(item.discountType, 'none');
  assert.equal(item.discountValue, 0);
  assert.equal(item.discountAmount, 0);
  assert.equal(item.discountReason, '');
});

test('Item-level fixed and percent discounts calculate net amount for MMK and USD', () => {
  const mmkItem = normalizeItem(
    {
      description: 'Website Development',
      originalAmount: 1500000,
      discountType: 'percent',
      discountValue: 10,
      discountReason: 'Early Bird',
    },
    'MMK'
  );
  assert.equal(mmkItem.discountAmount, 150000);
  assert.equal(mmkItem.amount, 1350000);
  assert.equal(mmkItem.discountReason, 'Early Bird');

  const usdItem = normalizeItem(
    {
      description: 'Cloud Hosting',
      originalAmount: 99.99,
      discountType: 'percent',
      discountValue: 15,
    },
    'USD'
  );
  assert.equal(usdItem.discountAmount, 15);
  assert.equal(usdItem.amount, 84.99);

  const fixedItem = normalizeItem(
    {
      description: 'Maintenance',
      originalAmount: 50000,
      discountType: 'fixed',
      discountValue: 12500,
    },
    'MMK'
  );
  assert.equal(fixedItem.discountAmount, 12500);
  assert.equal(fixedItem.amount, 37500);
});

test('Sequential stacking: FOC + item discount + whole-invoice discount + additional charges', () => {
  const calculated = calculateInvoiceFields(
    {
      currency: 'MMK',
      items: [
        {
          description: 'Core App',
          originalAmount: 100000,
          discountType: 'percent',
          discountValue: 10,
          discountReason: 'Promo',
        },
        {
          description: 'SSL Setup',
          originalAmount: 50000,
          isFoc: true,
        },
      ],
      discountType: 'fixed',
      discountValue: 10000,
      discountReason: 'Loyalty',
      discountAmount: 999999, // spoofed value must be ignored
      additionalCharges: [{ name: 'Urgent Delivery', amount: 5000 }],
    },
    {},
    { isCreate: true }
  );

  assert.equal(calculated.items[0].amount, 90000);
  assert.equal(calculated.items[1].amount, 0);
  assert.equal(calculated.items[1].originalAmount, 50000);
  assert.equal(calculated.amount, 90000);
  assert.equal(calculated.discountType, 'fixed');
  assert.equal(calculated.discountValue, 10000);
  assert.equal(calculated.discountAmount, 10000);
  assert.equal(calculated.discountReason, 'Loyalty');
  assert.equal(computeGrandTotal(calculated), 85000);
});

test('Boundary clamps prevent negative discounts, >100% discounts, or negative grandTotal', () => {
  const overPercent = normalizeDiscount(200000, 'percent', 150, 'Over', 'MMK');
  assert.equal(overPercent.discountValue, 100);
  assert.equal(overPercent.discountAmount, 200000);

  const overFixed = normalizeDiscount(200000, 'fixed', 500000, 'Over', 'MMK');
  assert.equal(overFixed.discountValue, 200000);
  assert.equal(overFixed.discountAmount, 200000);

  const negative = normalizeDiscount(200000, 'fixed', -5000, '', 'MMK');
  assert.equal(negative.discountValue, 0);
  assert.equal(negative.discountAmount, 0);

  assert.equal(computeGrandTotal({ amount: 50000, discountAmount: 90000 }), 0);
});

test('Legacy items without originalAmount or discount fields remain backward compatible', () => {
  const calculated = calculateInvoiceFields(
    {
      items: [{ description: 'Legacy Service', amount: 300000 }],
    },
    {},
    { isCreate: true }
  );
  assert.equal(calculated.items[0].originalAmount, 300000);
  assert.equal(calculated.items[0].amount, 300000);
  assert.equal(calculated.items[0].isFoc, false);
  assert.equal(calculated.amount, 300000);
  assert.equal(calculated.discountAmount, 0);
  assert.equal(computeGrandTotal(calculated), 300000);

  // Partial update changing items recalculates existing invoice-level percentage discount
  const edited = calculateInvoiceFields(
    {
      items: [{ description: 'Updated', originalAmount: 200000 }],
    },
    {
      currency: 'MMK',
      amount: 300000,
      discountType: 'percent',
      discountValue: 10,
      discountAmount: 30000,
      discountReason: 'VIP',
    }
  );
  assert.equal(edited.amount, 200000);
  assert.equal(edited.discountAmount, 20000);
  assert.equal(edited.discountReason, 'VIP');
});

test('Mongoose Invoice schema validates FOC/discount fields and computes grandTotal virtual', () => {
  const calculated = calculateInvoiceFields(
    {
      invoiceNumber: 'INV-26110001',
      companyName: 'Test Co',
      currency: 'USD',
      exchangeRate: 4500,
      items: [
        { description: 'Web', originalAmount: 200, discountType: 'fixed', discountValue: 20 },
        { description: 'Domain', originalAmount: 15, isFoc: true },
      ],
      discountType: 'percent',
      discountValue: 10,
      discountReason: 'Launch Promo',
    },
    {},
    { isCreate: true }
  );

  const doc = new Invoice(calculated);
  const validationError = doc.validateSync();
  assert.equal(validationError, undefined);
  assert.equal(doc.amount, 180);
  assert.equal(doc.discountAmount, 18);
  assert.equal(doc.grandTotal, 162);
});
