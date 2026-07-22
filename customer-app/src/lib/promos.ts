import { Promo } from '../api/shop';
import { CartLine, lineTotal } from '../store/shopCart';

/**
 * Client-side preview of what the vendor's promos do to this cart.
 *
 * This MIRRORS `FoodService.applyPromos` on the server so the customer can see
 * the discount before committing — the server stays authoritative and recomputes
 * everything when the order is actually placed. Keep the two in step: same
 * scope rules, same "single best discount wins, no stacking", same cap at the
 * subtotal.
 */
export interface PromoPreview {
  /** Money off the goods. */
  discount: number;
  /** The winning discount promo, if any. */
  applied: Promo | null;
  /** Vendor-fulfilled promos that apply to this cart (no money involved). */
  notes: Promo[];
}

/** Whether a promo covers a given cart line. */
function covers(p: Promo, line: CartLine, categoryOf: (menuItemId: string) => string | undefined): boolean {
  switch (p.scope) {
    case 'VENDOR': return true;
    case 'ITEM': return p.menuItemId === line.menuItemId;
    case 'CATEGORY': {
      const cat = categoryOf(line.menuItemId);
      return !!cat && !!p.category && cat.trim().toLowerCase() === p.category.trim().toLowerCase();
    }
    default: return false;
  }
}

/** Total of the lines a promo applies to (add-ons included, as charged). */
function eligibleAmount(p: Promo, lines: CartLine[], categoryOf: (id: string) => string | undefined): number {
  return lines.reduce((sum, l) => (covers(p, l, categoryOf) ? sum + lineTotal(l) : sum), 0);
}

export function previewPromos(
  vendorPromos: Promo[],
  lines: CartLine[],
  categoryOf: (menuItemId: string) => string | undefined,
): PromoPreview {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  let applied: Promo | null = null;
  let discount = 0;
  const notes: Promo[] = [];

  for (const p of vendorPromos) {
    if (!p.active) continue;
    const eligible = eligibleAmount(p, lines, categoryOf);
    if (eligible <= 0) continue;

    const isDiscount = p.promoKind === 'DISCOUNT' && !!p.discountValue && p.discountValue > 0;
    if (!isDiscount) { notes.push(p); continue; }

    const amount = p.discountType === 'PERCENT'
      ? Math.round(eligible * (p.discountValue as number)) / 100
      : Math.min(p.discountValue as number, eligible);

    if (amount > discount) { discount = amount; applied = p; }
  }

  discount = Math.min(Math.round(discount * 100) / 100, subtotal);
  return { discount, applied, notes };
}
