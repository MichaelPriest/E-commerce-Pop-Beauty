export const COMMERCIAL_PAYMENT_RESULTS = {
  awaiting: 'Aguardando aprovação no provedor',
  not_paid: 'Encerrado sem pagamento aplicado',
  confirmed: 'Pagamento conferido e confirmado',
  value_mismatch: 'Valor ou moeda divergente',
  late_approval: 'Aprovação fora da validade do link',
  closed_order: 'Pedido indisponível para confirmação',
  duplicate_payment: 'Outro pagamento já confirmou o pedido',
  provider_review: 'Estorno, contestação ou status a conferir',
} as const;

export type CommercialPaymentResult = keyof typeof COMMERCIAL_PAYMENT_RESULTS;

export const COMMERCIAL_REVIEW_RESULTS = [
  'value_mismatch', 'late_approval', 'closed_order', 'duplicate_payment', 'provider_review',
] as const;
