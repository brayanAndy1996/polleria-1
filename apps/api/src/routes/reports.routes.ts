import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { ReportsController } from '../controllers/reports.controller.ts';
import { requireRole } from '../middlewares/auth.ts';

export function createReportsRoutes(
  controller: ReportsController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.get('/reports/daily-sales', requireAuth, requireRole('admin'), controller.getDailySales);
  return router;
}
