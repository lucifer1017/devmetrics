import { DevMetricsReport, OutputFormat } from '../types';
import { formatAsTable } from './table.formatter';
import { formatAsJSON } from './json.formatter';
import { formatAsMarkdown } from './markdown.formatter';

export function formatReport(reports: DevMetricsReport[], format: OutputFormat): string {
  switch (format) {
    case 'table':
      return formatAsTable(reports);
    case 'json':
      return formatAsJSON(reports);
    case 'markdown':
      return formatAsMarkdown(reports);
    default:
      return formatAsTable(reports);
  }
}
