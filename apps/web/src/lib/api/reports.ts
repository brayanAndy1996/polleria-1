import { dailySalesReportSchema, type DailySalesReport } from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

export async function getDailySalesReport(date?: string): Promise<DailySalesReport> {
  const query = date === undefined ? '' : `?date=${encodeURIComponent(date)}`;
  const { body, status } = await apiClient.requestWithStatus(`/reports/daily-sales${query}`, {
    expectedStatus: 200,
  });
  return parseResponse(dailySalesReportSchema, status, body);
}
