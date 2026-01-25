import { DevMetricsReport } from '../types/index.js';

export function formatAsJSON(reports: DevMetricsReport[]): string {
  return JSON.stringify(reports, null, 2);
}
