import { toLimaDateTimeParts } from '@polleria/shared';
import type { OrderItem, Portion, UserRef } from '@polleria/shared';
import {
  normalizePrintableTextLines,
  PRINTER_LINE_WIDTH,
  PRINTER_MAX_LINES,
} from '../printer/print-document.ts';
import type { PrintDocument } from '../printer/print-document.ts';
import type { KitchenTicketPrintSnapshot } from './print-snapshot.ts';

export interface KitchenTicketCopy {
  copyNumber: number;
  requestedBy: UserRef;
  createdAt: string;
  reason: string;
}
const PORTION_NAMES: Record<Portion, string> = {
  eighth: '1/8',
  quarter: '1/4',
  half: '1/2',
  whole: 'Entero',
};
const KIND_NAMES = { initial: 'INICIAL', additional: 'ADICIONAL', void: 'ANULADO' } as const;
function dateText(value: string): string {
  const parts = toLimaDateTimeParts(new Date(value));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Ajusta por espacios; los fragmentos de una palabra larga conservan su sangría. */
function wrap(lines: readonly string[]): string[] {
  return normalizePrintableTextLines(lines).flatMap((line) => {
    const indent = line.match(/^ */)?.[0] ?? '';
    let remaining = line.slice(indent.length);
    const prefix = indent.slice(0, PRINTER_LINE_WIDTH - 1);
    const width = PRINTER_LINE_WIDTH - prefix.length;
    const output: string[] = [];
    while (remaining.length > width) {
      const space = remaining.lastIndexOf(' ', width);
      const end = space > 0 ? space : width;
      output.push((prefix + remaining.slice(0, end)).trimEnd());
      remaining = remaining.slice(end + (space > 0 ? 1 : 0));
    }
    output.push((prefix + remaining).trimEnd());
    return output;
  });
}

function portionLines(
  item: Pick<OrderItem, 'portion' | 'cut' | 'breastEighths' | 'legEighths'>,
): string[] {
  if (item.portion === null) return [];
  const lines = [
    `  Presentación: ${PORTION_NAMES[item.portion]}${item.cut === null ? '' : ` ${item.cut === 'breast' ? 'Pecho' : 'Pierna'}`}`,
  ];
  if (item.portion === 'half')
    lines.push(`  Pecho: ${item.breastEighths} octavos; Pierna: ${item.legEighths} octavos`);
  return lines;
}

export function formatKitchenTicketDocuments(
  snapshot: KitchenTicketPrintSnapshot,
  copy?: KitchenTicketCopy,
): PrintDocument[] {
  const { ticket } = snapshot;
  const header = wrap([
    ...(copy === undefined
      ? []
      : [
          `REIMPRESIÓN #${copy.copyNumber}`,
          `Solicitante: ${copy.requestedBy.displayName}`,
          `Fecha copia: ${dateText(copy.createdAt)}`,
          `Motivo copia: ${copy.reason}`,
        ]),
    `COMANDA #${ticket.id} - ${KIND_NAMES[ticket.kind]}`,
    `Pedido #${snapshot.orderIdAtIssue}`,
    ...snapshot.tablesAtIssue.map((table) => `Mesa: ${table.name}`),
    ...Array.from(new Set(ticket.items.map((item) => item.createdBy.displayName))).map(
      (name) => `Mozo: ${name}`,
    ),
    `Fecha: ${dateText(ticket.createdAt)}`,
  ]);
  const body = wrap(
    [...ticket.items]
      .sort((a, b) => a.id - b.id)
      .flatMap((item) => [
        `${item.quantity} ${item.productName}`,
        ...portionLines(item),
        `  Mozo: ${item.createdBy.displayName}`,
        ...(item.components.length === 0
          ? []
          : [
              '  Componentes por combo:',
              ...item.components.flatMap((component) => [
                `    ${component.quantity} ${component.productName}`,
                ...portionLines(component).map((line) => `  ${line}`),
              ]),
            ]),
        ...item.sauces.map((sauce) => `  Crema: ${sauce.quantity} ${sauce.productName}`),
        ...(item.notes === null ? [] : [`  Obs: ${item.notes}`]),
        ...(ticket.kind !== 'void'
          ? []
          : [
              `Anulado por: ${item.voidedBy?.displayName ?? ticket.createdBy.displayName}`,
              `Motivo: ${item.voidReason ?? ''}`,
            ]),
        '',
      ]),
  );
  // Reserva página, indicación de continuación y pie, incluso en la última página.
  const capacity = PRINTER_MAX_LINES - header.length - 3;
  if (capacity < 1) throw new Error('La cabecera de la comanda supera el límite de impresión.');
  const pageCount = Math.max(1, Math.ceil(body.length / capacity));
  return Array.from({ length: pageCount }, (_, index) => ({
    label: `comanda-${ticket.id}`,
    lines: [
      ...header,
      `Página ${index + 1}/${pageCount}`,
      ...(index === 0 ? [] : [`Continúa comanda #${ticket.id}`]),
      ...body.slice(index * capacity, (index + 1) * capacity),
      ...(index + 1 === pageCount ? [] : [`Continúa comanda #${ticket.id} en página ${index + 2}`]),
    ],
  }));
}
