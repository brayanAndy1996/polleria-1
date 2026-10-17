import { z } from 'zod';
import { kitchenTicketSchema, tableRefSchema } from '@polleria/shared';

/** Copia privada e inmutable de los datos resueltos en la transacción de emisión. */
export const kitchenTicketPrintSnapshotSchema = z
  .strictObject({
    version: z.literal(1),
    ticket: kitchenTicketSchema,
    orderIdAtIssue: z.number().int().positive(),
    tablesAtIssue: z.array(tableRefSchema),
  })
  .refine((value) => value.ticket.orderId === value.orderIdAtIssue);
export type KitchenTicketPrintSnapshot = z.infer<typeof kitchenTicketPrintSnapshotSchema>;
