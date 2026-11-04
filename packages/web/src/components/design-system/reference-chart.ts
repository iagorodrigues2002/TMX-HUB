const previewHours = [
  45.88, 32.12, 18.35, 13.76, 22.94, 59.65, 165.18, 293.65, 114.71, 78, 183.53, 376.24, 146.83,
  82.59, 229.41, 422.12, 165.18, 87.18, 201.89, 330.36, 119.3, 64.24, 41.29, 22.94,
];
export const hourlySamples: [number[], number[]] = [
  previewHours,
  previewHours.map((value) => value * 0.82),
];
export { hourlyCeiling, hourlyGeometry } from '../ui/revenue-geometry';
