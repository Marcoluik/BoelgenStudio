/** "599.0", "DKK" -> "599 kr." (øre vises kun når de findes). Bruges både ved build og i browseren. */
export function formatMoney(amount: string | number, currencyCode = "DKK"): string {
  const value = typeof amount === "number" ? amount : parseFloat(amount);
  if (!Number.isFinite(value)) return "";
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  try {
    return new Intl.NumberFormat("da-DK", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    }).format(value);
  } catch {
    return `${value} ${currencyCode}`;
  }
}
