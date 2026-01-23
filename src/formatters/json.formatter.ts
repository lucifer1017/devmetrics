import { DevMetricsReport } from '../types';

export function formatAsJSON(reports: DevMetricsReport[]): string {
  return JSON.stringify(reports, null, 2);
}
