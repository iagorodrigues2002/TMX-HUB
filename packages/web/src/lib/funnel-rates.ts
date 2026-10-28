export function funnelRates(entrants: number, checkouts: number, buyers: number) {
  if (
    ![entrants, checkouts, buyers].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    checkouts > entrants ||
    buyers > checkouts
  )
    return null;
  const advance = (a: number, b: number) => (b ? (a / b) * 100 : null);
  const first = advance(checkouts, entrants);
  const second = advance(buyers, checkouts);
  return {
    advances: [first, second],
    losses: [first === null ? null : 100 - first, second === null ? null : 100 - second],
    total: advance(buyers, entrants),
  };
}
