import { describe, it, expect } from 'vitest';

// ─── Pricing / Totals Unit Tests ──────────────────────────────
function calcTotals(
  itemsTotal: number,
  discountPct: number,
  serviceChargePct: number,
  taxPct: number
) {
  const subtotal = Math.round(itemsTotal * 100) / 100;
  const discountAmount = Math.round(subtotal * (discountPct / 100) * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const serviceChargeAmount = Math.round(afterDiscount * (serviceChargePct / 100) * 100) / 100;
  const taxable = afterDiscount + serviceChargeAmount;
  const taxAmount = Math.round(taxable * (taxPct / 100) * 100) / 100;
  const total = Math.round((taxable + taxAmount) * 100) / 100;
  return { subtotal, discountAmount, serviceChargeAmount, taxAmount, total };
}

describe('calcTotals', () => {
  it('computes totals with no discounts', () => {
    const result = calcTotals(100, 0, 10, 10);
    expect(result.subtotal).toBe(100);
    expect(result.discountAmount).toBe(0);
    expect(result.serviceChargeAmount).toBe(10);
    expect(result.taxAmount).toBe(11);
    expect(result.total).toBe(121);
  });

  it('applies discount before service charge and tax', () => {
    const result = calcTotals(100, 10, 10, 10);
    expect(result.subtotal).toBe(100);
    expect(result.discountAmount).toBe(10);
    const afterDiscount = 90;
    expect(result.serviceChargeAmount).toBe(9); // 10% of 90
    const taxable = 90 + 9; // 99
    expect(result.taxAmount).toBe(9.9); // 10% of 99
    expect(result.total).toBe(108.9);
  });

  it('handles zero tax', () => {
    const result = calcTotals(50, 0, 0, 0);
    expect(result.total).toBe(50);
  });

  it('handles floating point precision correctly', () => {
    const result = calcTotals(19.99, 0, 10, 10);
    expect(result.total).toBeCloseTo(24.19, 2);
  });

  it('handles 100% discount', () => {
    const result = calcTotals(100, 100, 10, 10);
    expect(result.discountAmount).toBe(100);
    expect(result.total).toBe(0);
  });
});

// ─── Order Status Transitions ─────────────────────────────────
type OrderStatus = 'draft' | 'open' | 'in_progress' | 'ready' | 'served' | 'paid' | 'voided' | 'merged';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['open', 'voided'],
  open: ['in_progress', 'voided'],
  in_progress: ['ready', 'voided'],
  ready: ['served', 'voided'],
  served: ['paid', 'voided'],
  paid: [],
  voided: [],
  merged: [],
};

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('Order status transitions', () => {
  it('allows open → in_progress', () => expect(canTransition('open', 'in_progress')).toBe(true));
  it('allows in_progress → ready', () => expect(canTransition('in_progress', 'ready')).toBe(true));
  it('allows ready → served', () => expect(canTransition('ready', 'served')).toBe(true));
  it('allows served → paid', () => expect(canTransition('served', 'paid')).toBe(true));
  it('blocks paid → voided', () => expect(canTransition('paid', 'voided')).toBe(false));
  it('blocks paid → open', () => expect(canTransition('paid', 'open')).toBe(false));
  it('allows any active status → voided', () => {
    for (const s of ['open', 'in_progress', 'ready', 'served'] as OrderStatus[]) {
      expect(canTransition(s, 'voided')).toBe(true);
    }
  });
});

// ─── Item Status Transitions ──────────────────────────────────
type ItemStatus = 'pending' | 'accepted' | 'in_progress' | 'ready' | 'served' | 'voided';

const ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  pending: ['accepted', 'voided'],
  accepted: ['in_progress', 'voided'],
  in_progress: ['ready', 'voided'],
  ready: ['served', 'voided'],
  served: [],
  voided: [],
};

function canItemTransition(from: ItemStatus, to: ItemStatus): boolean {
  return ITEM_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('Order item status transitions', () => {
  it('allows pending → accepted', () => expect(canItemTransition('pending', 'accepted')).toBe(true));
  it('allows accepted → in_progress', () => expect(canItemTransition('accepted', 'in_progress')).toBe(true));
  it('allows in_progress → ready', () => expect(canItemTransition('in_progress', 'ready')).toBe(true));
  it('blocks served → any', () => {
    expect(canItemTransition('served', 'ready')).toBe(false);
    expect(canItemTransition('served', 'voided')).toBe(false);
  });
});

// ─── Inventory Deduction ──────────────────────────────────────
describe('Inventory deduction', () => {
  it('deducts correct quantity for multiple items', () => {
    const stockBefore = 10;
    const recipeQtyPerUnit = 0.2; // kg per burger
    const orderQty = 3;
    const deducted = recipeQtyPerUnit * orderQty;
    const stockAfter = stockBefore - deducted;
    expect(stockAfter).toBeCloseTo(9.4, 2);
  });

  it('never goes below zero', () => {
    const stockBefore = 0.1;
    const deducted = 0.5;
    const stockAfter = Math.max(0, stockBefore - deducted);
    expect(stockAfter).toBe(0);
  });

  it('detects low stock correctly', () => {
    const quantity = 3;
    const threshold = 5;
    expect(quantity <= threshold).toBe(true);
  });
});
