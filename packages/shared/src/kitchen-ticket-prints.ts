import { z } from 'zod';
import { KITCHEN_TICKET_KINDS, tableRefSchema, userRefSchema } from './order-items.ts';

export const KITCHEN_TICKET_PRINT_ATTEMPT_STATUSES = [
  'queued',
  'printing',
  'succeeded',
  'failed',
  'uncertain',
] as const;
export const KITCHEN_TICKET_PRINT_STATUSES = [
  ...KITCHEN_TICKET_PRINT_ATTEMPT_STATUSES,
  'not_tracked',
] as const;
export const KITCHEN_TICKET_PRINT_ERROR_CODES = [
  'PRINTER_OUTPUT_FAILED',
  'PRINTER_INVALID_DOCUMENT',
  'PRINTER_EMPTY_DOCUMENT',
  'PRINT_TIMEOUT',
  'PRINT_OUTPUT_UNCERTAIN',
] as const;
export const kitchenTicketPrintAttemptStatusSchema = z.enum(KITCHEN_TICKET_PRINT_ATTEMPT_STATUSES);
export const kitchenTicketPrintStatusSchema = z.enum(KITCHEN_TICKET_PRINT_STATUSES);
export const kitchenTicketPrintErrorCodeSchema = z.enum(KITCHEN_TICKET_PRINT_ERROR_CODES);
const id = z.number().int().min(1).max(2147483647);
const count = z.number().int().min(0).max(2147483647);
export const kitchenTicketPrintAttemptViewSchema = z
  .strictObject({
    id,
    ticketId: id,
    copyNumber: count,
    status: kitchenTicketPrintAttemptStatusSchema,
    requestedBy: userRefSchema,
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    pageCount: id.nullable(),
    completedPages: count,
    errorCode: kitchenTicketPrintErrorCodeSchema.nullable(),
  })
  .refine((value) => value.pageCount === null || value.completedPages <= value.pageCount);
export const kitchenTicketPrintViewSchema = z
  .strictObject({
    ticketId: id,
    orderId: id,
    kind: z.enum(KITCHEN_TICKET_KINDS),
    tablesAtIssue: z.array(tableRefSchema),
    status: kitchenTicketPrintStatusSchema,
    lastAttempt: kitchenTicketPrintAttemptViewSchema.nullable(),
    canReprint: z.boolean(),
  })
  .refine((value) =>
    value.status === 'not_tracked'
      ? value.lastAttempt === null && value.tablesAtIssue.length === 0 && !value.canReprint
      : value.lastAttempt !== null &&
        value.lastAttempt.ticketId === value.ticketId &&
        value.lastAttempt.status === value.status,
  );
export const kitchenTicketPrintsResponseSchema = z.strictObject({
  prints: z.array(kitchenTicketPrintViewSchema),
});
export const kitchenTicketPrintAttentionResponseSchema = z.strictObject({
  prints: z.array(kitchenTicketPrintViewSchema).max(50),
  nextAfterTicketId: id.nullable(),
});
export const REPRINT_REASON_MAX = 200;
export const reprintKitchenTicketRequestSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.length <= REPRINT_REASON_MAX)
    .refine((value) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)),
});
export const reprintKitchenTicketResponseSchema = z
  .strictObject({
    attempt: kitchenTicketPrintAttemptViewSchema,
  })
  .refine(
    ({ attempt }) =>
      attempt.copyNumber >= 1 &&
      attempt.status === 'queued' &&
      attempt.pageCount === null &&
      attempt.completedPages === 0 &&
      attempt.startedAt === null &&
      attempt.finishedAt === null &&
      attempt.errorCode === null,
  );
export type KitchenTicketPrintAttemptStatus = z.infer<typeof kitchenTicketPrintAttemptStatusSchema>;
export type KitchenTicketPrintStatus = z.infer<typeof kitchenTicketPrintStatusSchema>;
export type KitchenTicketPrintErrorCode = z.infer<typeof kitchenTicketPrintErrorCodeSchema>;
export type KitchenTicketPrintAttemptView = z.infer<typeof kitchenTicketPrintAttemptViewSchema>;
export type KitchenTicketPrintView = z.infer<typeof kitchenTicketPrintViewSchema>;
export type KitchenTicketPrintsResponse = z.infer<typeof kitchenTicketPrintsResponseSchema>;
export type KitchenTicketPrintAttentionResponse = z.infer<
  typeof kitchenTicketPrintAttentionResponseSchema
>;
export type ReprintKitchenTicketRequest = z.infer<typeof reprintKitchenTicketRequestSchema>;
export type ReprintKitchenTicketResponse = z.infer<typeof reprintKitchenTicketResponseSchema>;
