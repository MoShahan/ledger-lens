import { describe, expect, it } from 'vitest';

import { applyUserEdits, validate } from './validate';

function field(value: unknown, extras: Record<string, unknown> = {}) {
  return {
    value,
    confidence: 0.9,
    sourceSnippet: '',
    status: 'trusted' as const,
    sourceOfTruth: 'model' as const,
    ...extras,
  };
}

function baseFields(overrides: Record<string, unknown> = {}) {
  return {
    vendor: field('Northline Supplies'),
    invoiceNumber: field('INV-1042'),
    invoiceDate: field('2026-03-12'),
    currency: field('USD'),
    subtotal: field('1284.60'),
    tax: field('0.00'),
    total: field('1284.60'),
    lineItems: field([
      { description: 'Copy paper', qty: 10, amount: '184.60' },
      { description: 'Toner cartridge', qty: 2, amount: '980.00' },
      { description: 'Freight', qty: 1, amount: '120.00' },
    ]),
    ...overrides,
  };
}

describe('validate', () => {
  it('matching totals stay ready', () => {
    const result = validate(baseFields() as never);
    expect(result.invoiceStatus).toBe('ready');
    expect(result.issues).toHaveLength(0);
  });

  it('line items vs total flags TOTAL_MISMATCH', () => {
    const result = validate(baseFields({ total: field('1184.60') }) as never);
    expect(result.invoiceStatus).toBe('needs_review');
    expect(result.issues.some((issue) => issue.code === 'TOTAL_MISMATCH')).toBe(true);
    expect(result.fields.total.status).toBe('needs_review');
  });

  it('user edit becomes source of truth and can clear a mismatch', () => {
    const broken = validate(baseFields({ total: field('1184.60') }) as never);
    const fixed = applyUserEdits(broken.fields, { total: '1284.60' });
    expect(fixed.fields.total.value).toBe('1284.60');
    expect(fixed.fields.total.sourceOfTruth).toBe('user');
    expect(fixed.invoiceStatus).toBe('ready');
  });
});
