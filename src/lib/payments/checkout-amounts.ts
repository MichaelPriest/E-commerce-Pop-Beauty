export type CheckoutPaymentItem = {
  sku: string;
  title: string;
  quantity: number;
  priceCents: number;
};

export function checkoutAmountsMatch(
  items: CheckoutPaymentItem[], deliveryFeeCents: number, totalCents: number,
): boolean {
  if (!items.length || !Number.isSafeInteger(deliveryFeeCents) || deliveryFeeCents < 0 ||
      !Number.isSafeInteger(totalCents) || totalCents <= 0) return false;
  let sum = deliveryFeeCents;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isSafeInteger(item.priceCents) || item.priceCents <= 0) return false;
    sum += item.priceCents * item.quantity;
    if (!Number.isSafeInteger(sum) || sum > totalCents) return false;
  }
  return sum === totalCents;
}

export function mercadoPagoCheckoutAmounts(items: CheckoutPaymentItem[], deliveryFeeCents: number) {
  return {
    items: items.map(item => ({
      id: item.sku.slice(0, 100), title: item.title.slice(0, 120),
      quantity: item.quantity, currency_id: 'BRL', unit_price: item.priceCents / 100,
    })),
    ...(deliveryFeeCents > 0 ? {shipments: {cost: deliveryFeeCents / 100, mode: 'not_specified'}} : {}),
  };
}
