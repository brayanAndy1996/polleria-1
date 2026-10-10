'use client';

import { Button, Label } from '@heroui/react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COMBO_ITEMS_MAX,
  COMBO_ITEM_QUANTITY_MAX,
  PORTIONS,
  PRODUCT_CATEGORIES,
  SINGLE_CUT_PORTIONS,
  comboItemInputSchema,
  formatSoles,
  replaceComboItemsRequestSchema,
} from '@polleria/shared';
import type { ComboItem, Product, ProductCategory } from '@polleria/shared';
import { useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '../../lib/api/error-message.ts';
import {
  issuesFromApiError,
  issuesFromZod,
  splitIssues,
  uniqueMessages,
} from '../../lib/api/issues.ts';
import { getComboItems, getProductPortions, replaceComboItems } from '../../lib/api/products.ts';
import { CUT_LABELS, PORTION_LABELS, PRODUCT_CATEGORY_LABELS } from '../../lib/menu-labels.ts';
import { LabeledInput } from '../users/labeled-input.tsx';

const NOTA_CATEGORIA =
  'Mientras tenga componentes cargados, la categoría del producto no se puede cambiar.';
const NOTA_SUMA =
  'La suma usa el precio de venta suelto de cada componente; si el pollo no vende suelta esa presentación, se usa el precio base del producto.';
const MAX_COMPONENTS_MESSAGE = 'Un combo admite hasta 10 componentes.';
const SINGLE_CUT = SINGLE_CUT_PORTIONS as readonly string[];

/**
 * Fila del editor: el producto se guarda como texto ('' sin elegir) porque el
 * selector es nativo; quantity viaja como texto y se valida con el esquema al
 * guardar; portion solo aplica a productos 'chicken' ('' = sin elegir todavía) y
 * cut solo a eighth/quarter.
 */
interface EditorRow {
  key: number;
  productId: string;
  quantity: string;
  portion: string;
  cut: string;
}

function buildRows(items: ComboItem[]): EditorRow[] {
  return items.map((item, index) => ({
    key: index + 1,
    productId: String(item.product.id),
    quantity: String(item.quantity),
    portion: item.portion ?? 'quarter',
    cut: item.cut ?? 'leg',
  }));
}

/** La fila para el PUT: nulls seguros para los que no son pollo (RN-007-05). */
function buildItem(row: EditorRow, catalog: ReadonlyMap<number, Product>) {
  const product = catalog.get(Number(row.productId));
  const isChicken = product?.category === 'chicken';
  const singleCut = isChicken && SINGLE_CUT.includes(row.portion);
  return {
    productId: Number(row.productId),
    quantity: Number(row.quantity),
    portion: isChicken ? (row.portion === '' ? null : row.portion) : null,
    cut: isChicken ? (singleCut ? row.cut : null) : null,
  };
}

/**
 * Cantidad con la que la fila entra a la comparación 'por separado suman'
 * (ADV-008-04/05/06): el campo es texto libre y Number() acepta '1e21', '0x10'
 * o '150', valores que el PUT rechaza o que desbordan la suma a Infinity y
 * tumban el render en formatSoles. La fila solo suma cuando su cantidad es un
 * entero dentro del rango que el contrato acepta (1..COMBO_ITEM_QUANTITY_MAX);
 * con cualquier otro texto devuelve null y la fila queda fuera de la suma.
 */
function sumableQuantity(text: string): number | null {
  const quantity = Number(text);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > COMBO_ITEM_QUANTITY_MAX) {
    return null;
  }
  return quantity;
}

/** Selector 'Producto': opción vacía y los no-combo agrupados por categoría con optgroup. */
function ProductSelect({
  id,
  value,
  disabled,
  grouped,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  grouped: [ProductCategory, Product[]][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Producto</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="min-h-12 w-full rounded-xl border border-separator bg-surface px-3 disabled:opacity-50"
      >
        <option value="">Elige un producto</option>
        {grouped.map(([category, group]) => (
          <optgroup key={category} label={PRODUCT_CATEGORY_LABELS[category]}>
            {group.map((product) => (
              <option key={product.id} value={String(product.id)}>
                {product.isActive ? product.name : `${product.name} (desactivado)`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Select genérico con etiqueta: lo comparten 'Presentación' y 'Parte'. */
function LabeledSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="min-h-12 w-full rounded-xl border border-separator bg-surface px-3 disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ComboItemsEditor({
  productId,
  products,
  comboPriceCents,
  items,
}: {
  productId: number;
  /** La carta completa (la consulta de la lista ya cargada): de ahí salen los candidatos. */
  products: Product[];
  comboPriceCents: number;
  items: ComboItem[];
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<EditorRow[]>(() => buildRows(items));
  const nextKey = useRef(items.length + 1);
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<number, string[]>>(new Map());
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const sending = useRef(false);
  /**
   * Catálogo para resolver productId -> Product: la lista primero (datos frescos) y,
   * como respaldo, el producto embebido de cada componente cargado (por si la lista
   * aún no lo trae). Los combos nunca entran como candidatos (RN-007-04).
   */
  const catalog = useMemo(() => {
    const map = new Map<number, Product>();
    for (const product of products) map.set(product.id, product);
    for (const item of items) map.set(item.product.id, item.product);
    return map;
  }, [products, items]);
  // Los candidatos no incluyen combos, agrupados por categoría en el orden de la carta.
  const grouped = useMemo(() => {
    const groups: [ProductCategory, Product[]][] = [];
    for (const category of PRODUCT_CATEGORIES) {
      if (category === 'combo') continue;
      const group = products.filter((product) => product.category === category);
      if (group.length > 0) groups.push([category, group]);
    }
    return groups;
  }, [products]);
  /** Productos 'chicken' distintos referenciados por las filas actuales. */
  const chickenIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of rows) {
      const product = catalog.get(Number(row.productId));
      if (product?.category === 'chicken') ids.add(product.id);
    }
    return [...ids].sort((a, b) => a - b);
  }, [rows, catalog]);
  /**
   * Una consulta GET /portions por pollo referenciado, con la misma clave que la
   * sección de presentaciones: comparten caché (D-008-09).
   */
  const portionsQueries = useQueries({
    queries: chickenIds.map((id) => ({
      queryKey: ['admin', 'products', id, 'portions'],
      queryFn: () => getProductPortions(id),
      retry: false,
    })),
  });
  const portionsByChicken = useMemo(() => {
    const map = new Map<number, { portion: string; cut: string | null; priceCents: number }[]>();
    chickenIds.forEach((id, index) => {
      map.set(id, portionsQueries[index]?.data ?? []);
    });
    return map;
  }, [chickenIds, portionsQueries]);
  const portionsPending = portionsQueries.some((query) => query.isPending);

  const save = useMutation({
    // rowKeys viaja con el envío: los issues 'items.N.*' del 400 llegan con el
    // índice del envío y hay que reexpresarlos con la clave estable de la fila.
    mutationFn: (submission: {
      items: { productId: number; quantity: number; portion: string | null; cut: string | null }[];
      rowKeys: number[];
    }) => replaceComboItems(productId, { items: submission.items }),
    onSuccess: (data) => {
      setRows(buildRows(data));
      setRowErrors(new Map());
      setSectionErrors([]);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (error, submission) => {
      const issues = issuesFromApiError(error);
      if (issues.length === 0) {
        setRowErrors(new Map());
        setSectionErrors([apiErrorMessage(error)]);
        return;
      }
      // 'items.N.*' va a la fila N del envío; se guarda por la clave de la fila
      // para que un 'Quitar' posterior no arrastre el mensaje a otra fila
      // (ADV-008-08). Un índice fuera del envío cae en la sección.
      const { byIndex, root } = splitIssues(issues, 'items');
      const mapped = new Map<number, string[]>();
      const sectionMessages = [...root];
      for (const [index, messages] of byIndex) {
        const key = submission.rowKeys[index];
        if (key === undefined) sectionMessages.push(...messages);
        else mapped.set(key, messages);
      }
      setRowErrors(mapped);
      setSectionErrors(sectionMessages);
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const updateRow = (index: number, patch: Partial<EditorRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const changeProduct = (index: number, productId: string) => {
    const product = catalog.get(Number(productId));
    const row = rows[index];
    if (!row) return;
    // Al elegir un pollo se preseleccionan cuarto y pierna (D-008-09 pregunta 9);
    // los que no son pollo viajan con presentación y parte null por construcción.
    if (product?.category === 'chicken') {
      updateRow(index, {
        productId,
        portion: row.portion === '' ? 'quarter' : row.portion,
        cut: row.cut === '' ? 'leg' : row.cut,
      });
    } else {
      updateRow(index, { productId });
    }
  };
  const addRow = () => {
    if (rows.length >= COMBO_ITEMS_MAX) return;
    setRows((current) => [
      ...current,
      { key: nextKey.current++, productId: '', quantity: '1', portion: '', cut: 'leg' },
    ]);
  };
  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, i) => i !== index));
  };
  const submit = () => {
    if (sending.current || save.isPending) return;
    // Validación por fila (D-008-13): primero los mensajes de la web, después el
    // esquema del contrato; cualquier error local cancela el PUT. Los errores se
    // guardan por la clave estable de la fila, no por su posición (ADV-008-08).
    const localErrors = new Map<number, string[]>();
    const sectionMessages: string[] = [];
    const body = rows.map((row) => buildItem(row, catalog));
    rows.forEach((row, index) => {
      const messages: string[] = [];
      const product = catalog.get(Number(row.productId));
      const isChicken = product?.category === 'chicken';
      const missingPortion = isChicken && row.portion === '';
      if (row.productId === '') messages.push('Elige el producto.');
      else if (missingPortion) messages.push('Elige la presentación del pollo.');
      if (row.productId !== '' && !missingPortion) {
        const parsed = comboItemInputSchema.safeParse(body[index]);
        if (!parsed.success) messages.push(...parsed.error.issues.map((issue) => issue.message));
      }
      if (messages.length > 0) localErrors.set(row.key, messages);
    });
    if (localErrors.size === 0) {
      // D-008-12: el cuerpo completo se valida con el esquema del contrato ANTES
      // de la red — así los duplicados ('items.N') y el tope ('items') se
      // detectan en local y no salen al PUT (ADV-008-07).
      const wholeBody = replaceComboItemsRequestSchema.safeParse({ items: body });
      if (!wholeBody.success) {
        const { byIndex, root } = splitIssues(issuesFromZod(wholeBody.error), 'items');
        sectionMessages.push(...root);
        for (const [index, messages] of byIndex) {
          const row = rows[index];
          if (row === undefined) sectionMessages.push(...messages);
          else localErrors.set(row.key, [...(localErrors.get(row.key) ?? []), ...messages]);
        }
      }
    }
    setRowErrors(localErrors);
    setSectionErrors(sectionMessages);
    if (localErrors.size > 0 || sectionMessages.length > 0) return;
    sending.current = true;
    save.mutate({ items: body, rowKeys: rows.map((row) => row.key) });
  };

  /**
   * Comparación 'por separado suman S/ X, el combo cuesta S/ Y' (D-008-09): solo con
   * filas completas (producto elegido, cantidad entera en el rango del PUT y, si es
   * pollo, su presentación elegida); el pollo cobra el precio de su presentación en
   * venta suelta con respaldo al priceCents del producto.
   */
  let separateTotal = 0;
  let completeRows = 0;
  for (const row of rows) {
    const product = catalog.get(Number(row.productId));
    const quantity = sumableQuantity(row.quantity);
    if (!product || quantity === null) continue;
    // Una fila de pollo suma solo con su presentación elegida (D-008-09):
    // sin presentación no hay precio de venta suelto qué comparar.
    if (product.category === 'chicken' && row.portion === '') continue;
    completeRows += 1;
    let unit = product.priceCents;
    if (product.category === 'chicken') {
      const sold = portionsByChicken.get(product.id);
      const wantedCut = SINGLE_CUT.includes(row.portion) ? row.cut : null;
      const match = sold?.find(
        (portion) => portion.portion === row.portion && portion.cut === wantedCut,
      );
      unit = match?.priceCents ?? product.priceCents;
    }
    separateTotal += unit * quantity;
  }
  const comparison = (() => {
    // Defensa extra sobre la suma (ADV-008-04): con cantidad acotada y priceCents
    // del contrato el total siempre es un entero seguro; si algo lo rompiera,
    // la comparación se omite en vez de lanzar en formatSoles dentro del render.
    if (completeRows === 0 || portionsPending || !Number.isSafeInteger(separateTotal)) {
      return null;
    }
    const combo = `El combo cuesta ${formatSoles(comboPriceCents)}`;
    const diff = separateTotal - comboPriceCents;
    if (diff === 0) return `${combo} (igual que por separado.)`;
    return `${combo} (${formatSoles(Math.abs(diff))} ${diff > 0 ? 'menos' : 'más'} que por separado).`;
  })();

  return (
    <>
      <p className="text-sm text-muted">{NOTA_CATEGORIA}</p>
      {rows.length === 0 && (
        <div className="space-y-1">
          <p>Este combo todavía no tiene componentes.</p>
          <p className="text-sm text-muted">
            Un combo sin componentes se vende como un producto simple.
          </p>
        </div>
      )}
      <div className="grid gap-3">
        {rows.map((row, index) => {
          const product = catalog.get(Number(row.productId));
          const isChicken = product?.category === 'chicken';
          const singleCut = isChicken && SINGLE_CUT.includes(row.portion);
          return (
            <fieldset key={row.key} className="space-y-3 rounded-xl border border-separator p-4">
              <legend className="px-1 font-semibold">{`Componente ${index + 1}`}</legend>
              <ProductSelect
                id={`componente-${row.key}-producto`}
                value={row.productId}
                disabled={save.isPending}
                grouped={grouped}
                onChange={(value) => {
                  changeProduct(index, value);
                }}
              />
              <LabeledInput
                id={`componente-${row.key}-cantidad`}
                label="Cantidad"
                inputMode="numeric"
                disabled={save.isPending}
                value={row.quantity}
                onChange={(event) => {
                  updateRow(index, { quantity: event.target.value });
                }}
              />
              {isChicken && (
                <LabeledSelect
                  id={`componente-${row.key}-presentacion`}
                  label="Presentación"
                  value={row.portion}
                  disabled={save.isPending}
                  options={PORTIONS.map((portion) => ({
                    value: portion,
                    label: PORTION_LABELS[portion],
                  }))}
                  onChange={(value) => {
                    updateRow(index, { portion: value });
                  }}
                />
              )}
              {singleCut && (
                <LabeledSelect
                  id={`componente-${row.key}-parte`}
                  label="Parte"
                  value={row.cut}
                  disabled={save.isPending}
                  options={[
                    { value: 'breast', label: CUT_LABELS.breast },
                    { value: 'leg', label: CUT_LABELS.leg },
                  ]}
                  onChange={(value) => {
                    updateRow(index, { cut: value });
                  }}
                />
              )}
              {/* Una fila tampoco repite el mismo mensaje dos veces (ADV-008-42). */}
              {uniqueMessages(rowErrors.get(row.key) ?? []).map((message) => (
                <p key={message} className="text-sm text-danger">
                  {message}
                </p>
              ))}
              <Button
                variant="secondary"
                className="min-h-12"
                isDisabled={save.isPending}
                onPress={() => {
                  removeRow(index);
                }}
              >
                Quitar
              </Button>
            </fieldset>
          );
        })}
      </div>
      <Button
        variant="secondary"
        className="min-h-12 w-full"
        isDisabled={rows.length >= COMBO_ITEMS_MAX || save.isPending}
        onPress={addRow}
      >
        Agregar componente
      </Button>
      {rows.length >= COMBO_ITEMS_MAX && (
        <p className="text-sm text-muted">{MAX_COMPONENTS_MESSAGE}</p>
      )}
      {comparison !== null && (
        <div className="space-y-1 rounded-xl border border-separator p-4">
          <p>{`Los componentes por separado suman ${formatSoles(separateTotal)}.`}</p>
          <p>{comparison}</p>
          <p className="text-sm text-muted">{NOTA_SUMA}</p>
        </div>
      )}
      {/* Dos issues con el mismo texto se ven una sola vez (ADV-008-42). */}
      {uniqueMessages(sectionErrors).map((message) => (
        <p key={message} role="alert" className="text-danger">
          {message}
        </p>
      ))}
      {save.isSuccess && <p role="status">Componentes guardados.</p>}
      <Button className="min-h-12 w-full text-lg" isDisabled={save.isPending} onPress={submit}>
        {save.isPending ? 'Guardando...' : 'Guardar componentes'}
      </Button>
    </>
  );
}

/**
 * Sección 'Componentes del combo' de la edición (AC-14 a AC-17): visible solo cuando
 * la categoría guardada es combo. Mismo contrato de carga que la de presentaciones.
 */
export function ComboItemsSection({
  productId,
  products,
  combo,
}: {
  productId: number;
  products: Product[];
  combo: Product;
}) {
  const items = useQuery({
    queryKey: ['admin', 'products', productId, 'items'],
    queryFn: () => getComboItems(productId),
    retry: false,
  });
  if (items.isPending) {
    return (
      <section className="space-y-4">
        <p role="status" className="p-6 text-center">
          Cargando componentes...
        </p>
      </section>
    );
  }
  const headingId = `componentes-${productId}-titulo`;
  return (
    <section role="group" aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-xl font-semibold">
        Componentes del combo
      </h2>
      {items.isError ? (
        <div className="space-y-4 p-6 text-center">
          <p role="alert">{apiErrorMessage(items.error)}</p>
          <Button
            className="min-h-12"
            onPress={() => {
              void items.refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <ComboItemsEditor
          productId={productId}
          products={products}
          comboPriceCents={combo.priceCents}
          items={items.data ?? []}
        />
      )}
    </section>
  );
}
