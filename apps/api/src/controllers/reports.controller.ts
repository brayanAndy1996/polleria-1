import { dailySalesQuerySchema } from '@polleria/shared';
import type { RequestHandler } from 'express';
import { createUnauthenticatedError, getAuthContext } from '../middlewares/auth.ts';
import type { ReportsService } from '../services/reports/reports.service.ts';

export interface ReportsController {
  getDailySales: RequestHandler;
}

export function createReportsController({
  reportsService,
}: {
  reportsService: ReportsService;
}): ReportsController {
  return {
    getDailySales: async (req, res, next) => {
      try {
        const auth = getAuthContext(res);
        if (auth === undefined) throw createUnauthenticatedError();
        const query = dailySalesQuerySchema.parse(req.query);
        res.json(await reportsService.getDailySales(query.date, { userId: auth.user.id }));
      } catch (error) {
        next(error);
      }
    },
  };
}
