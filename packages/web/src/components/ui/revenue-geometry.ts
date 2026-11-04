export function hourlyCeiling(values: number[]) {
  return (Math.ceil(Math.max(0, ...values) / 4 / 100) || 1) * 400;
}

export function formatRevenueTick(value: number) {
  return value === 0
    ? '0'
    : `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
}

/** Shared with the approved reference so line, points and hit targets use one scale. */
export function hourlyGeometry(
  values: number[],
  width = 600,
  height = 285,
  ceiling = hourlyCeiling(values),
) {
  const points = values.map((value, hour) => ({
    hour,
    value,
    x: 64 + (hour * (width - 82)) / Math.max(1, values.length - 1),
    y: 30 + (height - 68) * (1 - value / ceiling),
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  return { points, line, area: `${line} L${points.at(-1)?.x ?? 64},${height - 38} H64 Z` };
}
