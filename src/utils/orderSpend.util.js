/**
 * SQL expression for the amount a customer has actually paid on an order.
 * Orders marked paid before amount_paid was tracked fall back to their final total.
 */
export const paidAmountSql = (alias = 'o') => {
  const col = (name) => (alias ? `${alias}.${name}` : name);
  return `(
    CASE
      WHEN COALESCE(${col('amount_paid')}, 0) > 0 THEN ${col('amount_paid')}
      WHEN ${col('payment_status')} = 'paid' THEN COALESCE(${col('final_total')}, 0)
      ELSE 0
    END
  )`;
};
