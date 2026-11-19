const DISCOUNT_TYPES = new Set(['none', 'fixed', 'percent']);

const roundMoney = (value, currency = 'MMK') => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return currency === 'USD' ? Math.round(num * 100) / 100 : Math.round(num);
};

const normalizeDiscount = (baseAmount, type, value, reason = '', currency = 'MMK') => {
  const safeBase = Math.max(0, roundMoney(baseAmount, currency));
  const discountType = DISCOUNT_TYPES.has(type) ? type : 'none';
  const rawVal = Math.max(0, Number(value) || 0);
  const discountReason = typeof reason === 'string' ? reason.trim() : '';

  if (discountType === 'percent') {
    const discountValue = Math.min(100, rawVal);
    const discountAmount = Math.min(safeBase, roundMoney(safeBase * (discountValue / 100), currency));
    return { discountType, discountValue, discountAmount, discountReason };
  }

  if (discountType === 'fixed') {
    const discountValue = Math.min(safeBase, roundMoney(rawVal, currency));
    return { discountType, discountValue, discountAmount: discountValue, discountReason };
  }

  return { discountType: 'none', discountValue: 0, discountAmount: 0, discountReason: '' };
};

const normalizeItem = (item = {}, currency = 'MMK') => {
  const isFoc = Boolean(item.isFoc);
  const rawType = DISCOUNT_TYPES.has(item.discountType) ? item.discountType : 'none';
  const hasExplicitOriginal =
    item.originalAmount !== undefined &&
    item.originalAmount !== null &&
    item.originalAmount !== '';

  let rawOriginal;
  if (hasExplicitOriginal) {
    const parsedOriginal = Number(item.originalAmount);
    const parsedAmount = Number(item.amount);
    if (
      parsedOriginal === 0 &&
      !isFoc &&
      rawType === 'none' &&
      Number.isFinite(parsedAmount) &&
      parsedAmount > 0
    ) {
      rawOriginal = parsedAmount;
    } else {
      rawOriginal = parsedOriginal;
    }
  } else if (item.amount !== undefined && item.amount !== null && item.amount !== '') {
    rawOriginal = Number(item.amount);
  } else {
    rawOriginal = (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
  }

  const originalAmount = Math.max(0, roundMoney(rawOriginal, currency));

  if (isFoc) {
    return {
      ...item,
      originalAmount,
      isFoc: true,
      discountType: 'none',
      discountValue: 0,
      discountAmount: 0,
      discountReason: '',
      amount: 0,
    };
  }

  const discount = normalizeDiscount(
    originalAmount,
    rawType,
    item.discountValue,
    item.discountReason,
    currency
  );
  const amount = Math.max(0, roundMoney(originalAmount - discount.discountAmount, currency));

  return {
    ...item,
    originalAmount,
    isFoc: false,
    ...discount,
    amount,
  };
};

const computeGrandTotal = (invoice = {}) => {
  const currency = invoice.currency || 'MMK';
  const additionalTotal = (invoice.additionalCharges || []).reduce(
    (sum, c) => sum + (Number(c?.amount) || 0),
    0
  );
  const total =
    (Number(invoice.amount) || 0) -
    (Number(invoice.discountAmount) || 0) +
    (Number(invoice.platformFee) || 0) +
    additionalTotal;
  return Math.max(0, roundMoney(total, currency));
};

const calculateInvoiceFields = (data = {}, previous = {}, { isCreate = false } = {}) => {
  const result = { ...data };
  delete result.discountAmount;

  const currency = result.currency || previous.currency || 'MMK';

  if (Array.isArray(result.items)) {
    result.items = result.items.map((item) => normalizeItem(item, currency));
    result.amount = roundMoney(
      result.items.reduce((sum, item) => sum + (item.amount || 0), 0),
      currency
    );
  } else if (result.amount !== undefined) {
    result.amount = Math.max(0, roundMoney(result.amount, currency));
  }

  const subtotal =
    result.amount !== undefined
      ? result.amount
      : Math.max(0, roundMoney(previous.amount || 0, currency));

  const hasDiscountInput =
    result.discountType !== undefined ||
    result.discountValue !== undefined ||
    result.discountReason !== undefined;
  const hasPreviousDiscount =
    (previous.discountType && previous.discountType !== 'none') ||
    Number(previous.discountAmount) > 0;

  let effectiveDiscountAmount = Number(previous.discountAmount) || 0;

  if (isCreate || hasDiscountInput || hasPreviousDiscount) {
    const discountType =
      result.discountType !== undefined ? result.discountType : previous.discountType || 'none';
    const discountValue =
      result.discountValue !== undefined ? result.discountValue : previous.discountValue || 0;
    const discountReason =
      result.discountReason !== undefined ? result.discountReason : previous.discountReason || '';

    const normalized = normalizeDiscount(
      subtotal,
      discountType,
      discountValue,
      discountReason,
      currency
    );
    Object.assign(result, normalized);
    effectiveDiscountAmount = normalized.discountAmount;
  }

  const feeBase = Math.max(0, roundMoney(subtotal - effectiveDiscountAmount, currency));
  if (result.platformFeeRate !== undefined) {
    result.platformFee = roundMoney(feeBase * ((Number(result.platformFeeRate) || 0) / 100), currency);
  } else if (
    (result.amount !== undefined || result.discountAmount !== undefined) &&
    previous.platformFeeRate
  ) {
    result.platformFee = roundMoney(feeBase * ((Number(previous.platformFeeRate) || 0) / 100), currency);
  }

  return result;
};

module.exports = {
  DISCOUNT_TYPES,
  roundMoney,
  normalizeDiscount,
  normalizeItem,
  computeGrandTotal,
  calculateInvoiceFields,
};
