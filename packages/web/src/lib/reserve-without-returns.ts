export function reserveWithoutReturns(day: {
  reserve_brl_minor: number;
  reversed_reserve_brl_minor: number;
}) {
  return day.reserve_brl_minor - day.reversed_reserve_brl_minor;
}
