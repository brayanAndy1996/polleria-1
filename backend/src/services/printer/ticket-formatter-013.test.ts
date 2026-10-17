import type { KitchenTicket, OrderItem } from '@polleria/shared';
import { describe, expect, it } from 'vitest';
import { formatKitchenTicketDocuments } from '../kitchen-ticket-prints/ticket-formatter.ts';

const waiter = { id: 7, displayName: 'Juan' };
const admin = { id: 1, displayName: 'Doña Luz' };
function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 11,
    productId: 1,
    productName: 'Pollo a la brasa',
    productCategory: 'chicken',
    quantity: 2,
    priceCents: 2600,
    portion: 'half',
    cut: null,
    breastEighths: 6,
    legEighths: 2,
    notes: 'sin ensalada',
    sauces: [{ productId: 6, productName: 'Ocopa', quantity: 2, priceCents: 300 }],
    components: [],
    status: 'sent',
    kitchenTicketId: 5,
    voidTicketId: null,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    voidRequestedBy: null,
    voidRequestedAt: null,
    voidRequestReason: null,
    orderedAtTable: { id: 3, name: 'Mesa 3' },
    createdBy: waiter,
    createdAt: '2026-10-12T23:30:45.000Z',
    ...overrides,
  };
}
function snapshot(items = [item()], kind: KitchenTicket['kind'] = 'initial') {
  return {
    version: 1 as const,
    ticket: {
      id: 5,
      orderId: 41,
      kind,
      createdBy: kind === 'void' ? admin : waiter,
      createdAt: '2026-10-12T23:30:45.000Z',
      items,
    },
    orderIdAtIssue: 41,
    tablesAtIssue: [
      { id: 3, name: 'Mesa 3' },
      { id: 4, name: 'Mesa 4' },
    ],
  };
}
function text(documents: ReturnType<typeof formatKitchenTicketDocuments>) {
  return documents.flatMap((document) => document.lines).join('\n');
}
function assertCanonical(documents: ReturnType<typeof formatKitchenTicketDocuments>) {
  const alphabet =
    Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('') +
    'áéíóúüñÁÉÍÓÚÜÑ¿¡°ºª';
  expect(documents.length).toBeGreaterThan(0);
  for (const document of documents) {
    expect(document.lines.length).toBeLessThanOrEqual(500);
    expect(document.lines.length).toBeGreaterThan(0);
    expect(document.label).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(document.label.length).toBeLessThanOrEqual(32);
    for (const line of document.lines) {
      expect(line.length).toBeLessThanOrEqual(48);
      expect(line.endsWith(' ')).toBe(false);
      expect([...line].every((character) => alphabet.includes(character))).toBe(true);
    }
  }
}

describe('013: documentos de cocina desde snapshot puro', () => {
  it.each([
    ['initial', 'INICIAL'],
    ['additional', 'ADICIONAL'],
    ['void', 'ANULADO'],
  ] as const)(
    'AC-05: %s conserva número global, pedido, mesas, actor y hora Lima sin dinero',
    (kind, label) => {
      const source = snapshot(
        [
          item({
            status: kind === 'void' ? 'voided' : 'sent',
            voidReason: kind === 'void' ? 'Error de cocina' : null,
            voidedBy: kind === 'void' ? admin : null,
          }),
        ],
        kind,
      );
      const before = structuredClone(source);
      const documents = formatKitchenTicketDocuments(source);
      const output = text(documents);
      assertCanonical(documents);
      for (const expected of [
        `COMANDA #5 - ${label}`,
        'Pedido #41',
        'Mesa 3',
        'Mesa 4',
        'Juan',
        '12/10/2026 18:30:45',
        'Pollo a la brasa',
        '1/2',
        'Ocopa',
        'sin ensalada',
      ])
        expect(output).toContain(expected);
      expect(output).toMatch(/6.*Pecho|Pecho.*6/);
      expect(output).toMatch(/2.*Pierna|Pierna.*2/);
      expect(output).not.toMatch(/S\/|5200|2600|Total|Precio/);
      if (kind === 'void') {
        expect(output).toContain('Anulado por: Doña Luz');
        expect(output).toContain('Motivo: Error de cocina');
      }
      expect(source).toEqual(before);
    },
  );

  it('AC-05: incluye bebidas, presentaciones y componentes por combo con sus cantidades copiadas, en orden de id', () => {
    const documents = formatKitchenTicketDocuments(
      snapshot([
        item({
          id: 20,
          productName: 'Inca Kola',
          productCategory: 'drink',
          portion: null,
          breastEighths: 0,
          legEighths: 0,
          notes: null,
          sauces: [],
        }),
        item({
          id: 10,
          productName: 'Mostrito',
          productCategory: 'combo',
          portion: null,
          components: [
            {
              productId: 1,
              productName: 'Pollo componente',
              quantity: 1,
              portion: 'quarter',
              cut: 'leg',
              breastEighths: 0,
              legEighths: 2,
            },
            {
              productId: 2,
              productName: 'Chaufa',
              quantity: 2,
              portion: null,
              cut: null,
              breastEighths: 0,
              legEighths: 0,
            },
          ],
        }),
      ]),
    );
    const output = text(documents);
    expect(output).toContain('Componentes por combo');
    expect(output).toContain('Pollo componente');
    expect(output).toContain('1/4');
    expect(output).toContain('Pierna');
    expect(output).toMatch(/2.*Chaufa|Chaufa.*2/);
    expect(output).toContain('Inca Kola');
    expect(output.indexOf('Mostrito')).toBeLessThan(output.indexOf('Inca Kola'));
    assertCanonical(documents);
  });

  it('AC-06: ajusta por palabras y solo corta duro palabras de más de 48; conserva sangría, notas y Unicode saneado', () => {
    const notes = 'palabra '.repeat(24).trim();
    const source = snapshot([item({ productName: 'pollo\u001b@\u200b\u{1f357}', notes })]);
    const documents = formatKitchenTicketDocuments(source);
    assertCanonical(documents);
    expect(text(documents)).toContain('pollo@?');
    expect(
      documents
        .flatMap((document) => document.lines)
        .filter((line) => line.includes('palabra'))
        .every((line) => !/\bpalab$|^ra\b/.test(line)),
    ).toBe(true);
    expect(text(documents).match(/palabra/g)).toHaveLength(24);
    const long = formatKitchenTicketDocuments(snapshot([item({ notes: 'x'.repeat(200) })]));
    expect(text(long).match(/x/g)).toHaveLength(200);
    assertCanonical(long);
  });

  it('AC-06: tanda máxima de 20×10 componentes/6 cremas y notas de 200 pagina sin perder un fragmento', () => {
    const maximum = Array.from({ length: 20 }, (_, index) =>
      item({
        id: index + 1,
        productName: `Producto-${index + 1}`,
        productCategory: 'combo',
        portion: null,
        notes: `N${String(index + 1).padStart(2, '0')}-` + 'Z'.repeat(196),
        components: Array.from({ length: 10 }, (_, child) => ({
          productId: child + 1,
          productName: `Componente-${index + 1}-${child + 1}-` + 'Q'.repeat(38),
          quantity: 99,
          portion: null,
          cut: null,
          breastEighths: 0,
          legEighths: 0,
        })),
        sauces: Array.from({ length: 6 }, (_, sauce) => ({
          productId: sauce + 1,
          productName: `Crema-${index + 1}-${sauce + 1}-` + 'W'.repeat(42),
          quantity: 99,
          priceCents: 99999,
        })),
      }),
    );
    const documents = formatKitchenTicketDocuments(snapshot(maximum));
    const output = text(documents);
    expect(documents.length).toBeGreaterThan(1);
    assertCanonical(documents);
    for (const [index, document] of documents.entries()) {
      const page = document.lines.join('\n');
      for (const header of [
        'COMANDA #5 - INICIAL',
        'Mesa 3',
        'Mesa 4',
        'Juan',
        '12/10/2026 18:30:45',
        `Página ${index + 1}/${documents.length}`,
      ])
        expect(page).toContain(header);
    }
    expect(output).toContain('Continúa');
    for (let index = 1; index <= 20; index++) {
      expect(output).toContain(`Producto-${index}`);
      expect(output).toContain(`N${String(index).padStart(2, '0')}-`);
      for (let child = 1; child <= 10; child++)
        expect(output).toContain(`Componente-${index}-${child}-`);
      for (let sauce = 1; sauce <= 6; sauce++) expect(output).toContain(`Crema-${index}-${sauce}-`);
    }
    expect((output.match(/Z/g) ?? []).length).toBe(20 * 196);
    expect((output.match(/Q/g) ?? []).length).toBe(20 * 10 * 38);
    expect((output.match(/W/g) ?? []).length).toBe(20 * 6 * 42);
  });

  it('AC-11: copia completa añade número, solicitante, hora y motivo, conservando ANULADO y el contenido original', () => {
    const source = snapshot(
      [item({ status: 'voided', voidReason: 'Motivo original', voidedBy: admin })],
      'void',
    );
    const documents = formatKitchenTicketDocuments(source, {
      copyNumber: 2,
      requestedBy: { id: 9, displayName: 'Ana' },
      createdAt: '2026-10-13T01:00:00.000Z',
      reason: 'Se perdió el archivo',
    });
    const output = text(documents);
    for (const expected of [
      'REIMPRESIÓN #2',
      'Ana',
      '12/10/2026 20:00:00',
      'Se perdió el archivo',
      'COMANDA #5 - ANULADO',
      'Motivo original',
      'Doña Luz',
      '12/10/2026 18:30:45',
    ])
      expect(output).toContain(expected);
    assertCanonical(documents);
  });
});
