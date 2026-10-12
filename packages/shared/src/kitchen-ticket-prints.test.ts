import { describe, expect, it } from 'vitest';
import { kitchenTicketPrintAttemptViewSchema, kitchenTicketPrintViewSchema, kitchenTicketPrintsResponseSchema, kitchenTicketPrintAttentionResponseSchema, reprintKitchenTicketRequestSchema, reprintKitchenTicketResponseSchema } from './kitchen-ticket-prints.ts';

const attempt = { id:1,ticketId:5,copyNumber:0,status:'queued',requestedBy:{ id:7,displayName:'Juan' },createdAt:'2026-10-12T23:30:45.000Z',startedAt:null,finishedAt:null,pageCount:null,completedPages:0,errorCode:null };
const view = { ticketId:5,orderId:41,kind:'initial',tablesAtIssue:[{ id:3,name:'Mesa 3' }],status:'queued',lastAttempt:attempt,canReprint:false };

describe('013: contrato compartido estricto de generación de archivos', () => {
  it('AC-11: acepta vistas y sobres exactos de OpenAPI 0.10.0', () => {
    expect(kitchenTicketPrintAttemptViewSchema.parse(attempt)).toEqual(attempt);
    expect(kitchenTicketPrintViewSchema.parse(view)).toEqual(view);
    expect(kitchenTicketPrintsResponseSchema.parse({ prints:[view] })).toEqual({ prints:[view] });
    expect(kitchenTicketPrintAttentionResponseSchema.parse({ prints:[view],nextAfterTicketId:null })).toEqual({ prints:[view],nextAfterTicketId:null });
    const copyAttempt = { ...attempt, copyNumber: 1 };
    expect(reprintKitchenTicketResponseSchema.parse({ attempt: copyAttempt })).toEqual({ attempt: copyAttempt });
    expect(reprintKitchenTicketResponseSchema.safeParse({ attempt }).success).toBe(false);
  });
  it('AC-09: not_tracked no permite copia ni inventa tablas o intento histórico', () => {
    const legacy = { ...view,status:'not_tracked',tablesAtIssue:[],lastAttempt:null };
    expect(kitchenTicketPrintViewSchema.parse(legacy)).toEqual(legacy);
    for(const invalid of [{ ...legacy,canReprint:true },{ ...legacy,lastAttempt:attempt },{ ...legacy,tablesAtIssue:view.tablesAtIssue }]) expect(kitchenTicketPrintViewSchema.safeParse(invalid).success).toBe(false);
  });
  it.each(['path','destination','ownerHost','cause','snapshot','voidReason','reason'])('AC-11: rechaza campo privado %s en intento, vista y sobres', (field) => {
    for(const [schema,body] of [[kitchenTicketPrintAttemptViewSchema,attempt],[kitchenTicketPrintViewSchema,view],[kitchenTicketPrintsResponseSchema,{ prints:[view] }],[reprintKitchenTicketResponseSchema,{ attempt }]] as const) expect(schema.safeParse({ ...body,[field]:'/privado' }).success).toBe(false);
  });
  it.each(['queued','printing','succeeded','failed','uncertain'])('AC-11: el enum reconoce %s y exige cada clave pública', (status) => {
    expect(kitchenTicketPrintAttemptViewSchema.safeParse({ ...attempt,status }).success).toBe(true);
    for(const key of Object.keys(attempt)) { const partial:Record<string,unknown> = { ...attempt }; delete partial[key]; expect(kitchenTicketPrintAttemptViewSchema.safeParse(partial).success).toBe(false); }
  });
  it.each(['PRINT_TIMEOUT','PRINT_OUTPUT_UNCERTAIN','PRINTER_OUTPUT_FAILED','PRINTER_INVALID_DOCUMENT','PRINTER_EMPTY_DOCUMENT'])('AC-11: solo admite código seguro %s sin causa o ruta', (errorCode) => {
    expect(kitchenTicketPrintAttemptViewSchema.safeParse({ ...attempt,status:'failed',errorCode }).success).toBe(true);
    expect(kitchenTicketPrintAttemptViewSchema.safeParse({ ...attempt,errorCode:'/tmp/impresora: EACCES' }).success).toBe(false);
  });
  it('AC-10: motivo se recorta, mide 1–200 UTF16 y excluye Cc/Cf/Zl/Zp y campos extra', () => {
    expect(reprintKitchenTicketRequestSchema.parse({ reason:'  Se perdió el archivo  ' })).toEqual({ reason:'Se perdió el archivo' });
    expect(reprintKitchenTicketRequestSchema.parse({ reason:'x'.repeat(200) })).toEqual({ reason:'x'.repeat(200) });
    expect(reprintKitchenTicketRequestSchema.parse({ reason:'\u{1f357}'.repeat(100) })).toEqual({ reason:'\u{1f357}'.repeat(100) });
    for(const reason of ['', '  ', 'x'.repeat(201),'\u{1f357}'.repeat(101),'a\nb','a\u001bb','a\u200bb','a\u2028b','a\u2029b']) expect(reprintKitchenTicketRequestSchema.safeParse({ reason }).success).toBe(false);
    expect(reprintKitchenTicketRequestSchema.safeParse({ reason:'copia',ticketId:5 }).success).toBe(false);
  });
  it('AC-11: límites numéricos no admiten fracciones, negativos, NaN o Infinity ni estados inventados', () => {
    for(const number of [-1,1.5,NaN,Infinity]) {
      for(const key of ['id','ticketId','copyNumber','completedPages']) expect(kitchenTicketPrintAttemptViewSchema.safeParse({ ...attempt,[key]:number }).success).toBe(false);
    }
    expect(kitchenTicketPrintAttemptViewSchema.safeParse({ ...attempt,status:'not_tracked' }).success).toBe(false);
    expect(kitchenTicketPrintViewSchema.safeParse({ ...view,status:'printed' }).success).toBe(false);
    expect(kitchenTicketPrintAttemptViewSchema.safeParse({ ...attempt,createdAt:'2026-10-12T18:30:45-05:00' }).success).toBe(false);
  });
});
