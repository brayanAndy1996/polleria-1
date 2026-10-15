'use client';

import { Button } from '@heroui/react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ORDER_ITEMS_PER_SEND_MAX,
  ORDER_ITEM_NOTES_MAX,
  PRODUCT_CATEGORIES,
  SINGLE_CUT_PORTIONS,
  formatSoles,
  sendOrderItemsRequestSchema,
} from '@polleria/shared';
import type {
  Cut,
  MenuComboItem,
  MenuProduct,
  OrderItemComponentInput,
  Portion,
  ProductCategory,
} from '@polleria/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Label } from '@heroui/react';
import { RoleGuard } from '../../../../../components/auth/role-guard.tsx';
import { ScreenState } from '../../../../../components/auth/screen-state.tsx';
import { LabeledInput } from '../../../../../components/users/labeled-input.tsx';
import { apiClient, parseResponse } from '../../../../../lib/api/client.ts';
import { apiErrorMessage } from '../../../../../lib/api/error-message.ts';
import {
  issuesFromApiError,
  issuesFromZod,
  splitIssues,
  uniqueMessages,
} from '../../../../../lib/api/issues.ts';
import { getMenu } from '../../../../../lib/api/menu.ts';
import { createIdempotencyKey } from '../../../../../lib/idempotency.ts';
import {
  CUT_LABELS,
  PORTION_LABELS,
  PRODUCT_CATEGORY_LABELS,
  formatPortionCutLabel,
} from '../../../../../lib/menu-labels.ts';

const NOTICE_KEY = 'polleria:orderNotice';
const SENT_NOTICE = 'Pedido registrado. Consulta la generación de la comanda.';
/** Categorías con cremas (RN-010-13): pollo, platos y combos. */
const SAUCE_CATEGORIES: readonly ProductCategory[] = ['chicken', 'dish', 'combo'];
const DISTRIBUTIONS: readonly { label: string; breast: number; leg: number }[] = [
  { label: '2 pecho y 2 pierna', breast: 2, leg: 2 },
  { label: '3 pecho y 1 pierna', breast: 3, leg: 1 },
  { label: '1 pecho y 3 pierna', breast: 1, leg: 3 },
  { label: '4 pecho y 0 pierna', breast: 4, leg: 0 },
  { label: '0 pecho y 4 pierna', breast: 0, leg: 4 },
];
const DEFAULT_DISTRIBUTION = DISTRIBUTIONS[0]!;

/** Presentaciones deduplicadas en el orden de la carta. */
function offeredPortions(product: MenuProduct): Portion[] {
  const list: Portion[] = [];
  for (const row of product.portions) {
    if (!list.includes(row.portion)) list.push(row.portion);
  }
  return list;
}

/** Partes realmente ofertadas para una presentación (en el orden de la carta, ADV-011-11). */
function offeredCuts(product: MenuProduct, portion: Portion | null): Cut[] {
  const cuts: Cut[] = [];
  for (const row of product.portions) {
    if (row.portion === portion && row.cut !== null && !cuts.includes(row.cut)) cuts.push(row.cut);
  }
  return cuts;
}

/** Parte ofertada por defecto para una presentación de una sola parte: pierna si está. */
function defaultCut(product: MenuProduct, portion: Portion): Cut {
  const cuts = offeredCuts(product, portion);
  if (cuts.includes('leg')) return 'leg';
  return cuts[0] ?? 'leg';
}

/** Precio del ítem: la fila de la grilla de presentaciones; sin oferta no hay precio que mostrar. */
function unitPrice(product: MenuProduct, portion: Portion | null, cut: Cut | null): number {
  if (portion === null) return product.priceCents;
  const single = (SINGLE_CUT_PORTIONS as readonly string[]).includes(portion);
  const row = product.portions.find(
    (candidate) =>
      candidate.portion === portion && (single ? candidate.cut === cut : candidate.cut === null),
  );
  return row?.priceCents ?? 0;
}

/** Fotos locales de demostración: solo se asocian por nombre a su producto real. */
function productImage(product: MenuProduct): string | null {
  const name = product.name.toLocaleLowerCase('es-PE');
  if (name.includes('chaufa')) return '/images/chaufa-demo.png';
  if (name.includes('chicha morada')) return '/images/chicha-demo.png';
  if (name.startsWith('pollo a la brasa')) return '/images/pollo-demo.png';
  return null;
}

function productCardPrice(product: MenuProduct): string {
  if (product.category === 'chicken' && product.portions.length > 0) {
    const startingCents = Math.min(...product.portions.map((portion) => portion.priceCents));
    return `Desde ${formatSoles(startingCents)}`;
  }
  return formatSoles(product.priceCents);
}

interface CartSauce {
  productId: number;
  productName: string;
  priceCents: number;
  quantity: number;
}
interface CartLine {
  key: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  portion: Portion | null;
  cut: Cut | null;
  breastEighths: number;
  legEighths: number;
  notes: string;
  sauces: CartSauce[];
  /** Solo cuando el mozo cambió la parte de algún componente de pollo (D-011-08). */
  components: OrderItemComponentInput[] | null;
}
function linePrice(line: CartLine): number {
  return (
    line.quantity * line.unitPriceCents +
    line.sauces.reduce((total, sauce) => total + sauce.quantity * sauce.priceCents, 0)
  );
}

interface EditorState {
  quantity: string;
  portion: Portion | null;
  cut: Cut;
  breastEighths: number;
  legEighths: number;
  notes: string;
  sauces: Map<number, number>;
  /** Componente de pollo -> parte o distribución elegida por el mozo. */
  componentChoices: Map<number, { cut: Cut; breastEighths: number; legEighths: number }>;
}
function defaultEditorState(product: MenuProduct): EditorState {
  const portions = offeredPortions(product);
  const portion = portions.includes('quarter') ? 'quarter' : (portions[0] ?? null);
  const choices = new Map<number, { cut: Cut; breastEighths: number; legEighths: number }>();
  for (const item of product.items) {
    if (item.product.category === 'chicken' && item.portion !== null) {
      choices.set(item.product.id, {
        cut: item.cut ?? 'leg',
        breastEighths: DEFAULT_DISTRIBUTION.breast,
        legEighths: DEFAULT_DISTRIBUTION.leg,
      });
    }
  }
  return {
    quantity: '1',
    portion,
    cut: portion === null ? 'leg' : defaultCut(product, portion),
    breastEighths: DEFAULT_DISTRIBUTION.breast,
    legEighths: DEFAULT_DISTRIBUTION.leg,
    notes: '',
    sauces: new Map(),
    componentChoices: choices,
  };
}

/** Select nativo con su etiqueta, mismo patrón que LabeledInput. */
function LabeledSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="min-h-12 w-full rounded-xl border border-separator bg-surface px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

/** Editor del ítem abierto por la tarjeta (D-011-07): cantidad, presentación/parte/distribución, cremas, observación y componentes del combo. */
function ItemEditor({
  product,
  sauces,
  editor,
  onChange,
  onAdd,
}: {
  product: MenuProduct;
  sauces: MenuProduct[];
  editor: EditorState;
  onChange: (next: EditorState) => void;
  onAdd: () => void;
}) {
  const portions = offeredPortions(product);
  const singleCut =
    editor.portion !== null && (SINGLE_CUT_PORTIONS as readonly string[]).includes(editor.portion);
  return (
    <div className="space-y-4 rounded-2xl border border-separator bg-surface px-4 py-4">
      <LabeledInput
        id={`qty-${product.id}`}
        label="Cantidad"
        inputMode="numeric"
        value={editor.quantity}
        onChange={(event) => onChange({ ...editor, quantity: event.target.value })}
      />
      {product.category === 'chicken' && portions.length > 0 && (
        <LabeledSelect
          id={`portion-${product.id}`}
          label="Presentación"
          value={editor.portion ?? ''}
          onChange={(value) => {
            const portion = value as Portion;
            onChange({ ...editor, portion, cut: defaultCut(product, portion) });
          }}
        >
          {portions.map((portion) => (
            <option key={portion} value={portion}>
              {PORTION_LABELS[portion]}
            </option>
          ))}
        </LabeledSelect>
      )}
      {product.category === 'chicken' && singleCut && (
        <LabeledSelect
          id={`cut-${product.id}`}
          label="Parte"
          value={editor.cut}
          onChange={(value) => {
            // Solo partes realmente ofertadas: un valor ajeno a la grilla no
            // puede colarse por el DOM (ADV-011-11).
            if ((offeredCuts(product, editor.portion) as string[]).includes(value))
              onChange({ ...editor, cut: value as Cut });
          }}
        >
          {offeredCuts(product, editor.portion).map((cut) => (
            <option key={cut} value={cut}>
              {CUT_LABELS[cut]}
            </option>
          ))}
        </LabeledSelect>
      )}
      {product.category === 'chicken' && editor.portion === 'half' && (
        <LabeledSelect
          id={`dist-${product.id}`}
          label="Distribución"
          value={`${editor.breastEighths}-${editor.legEighths}`}
          onChange={(value) => {
            const [breast, leg] = value.split('-').map(Number);
            onChange({ ...editor, breastEighths: breast!, legEighths: leg! });
          }}
        >
          {DISTRIBUTIONS.map((dist) => (
            <option key={dist.label} value={`${dist.breast}-${dist.leg}`}>
              {dist.label}
            </option>
          ))}
        </LabeledSelect>
      )}
      {product.category === 'combo' && product.items.length > 0 && (
        <ul className="ml-2 space-y-2">
          {product.items.map((item) => {
            const choice = editor.componentChoices.get(item.product.id);
            const isSingleCutChicken =
              item.product.category === 'chicken' &&
              item.portion !== null &&
              (SINGLE_CUT_PORTIONS as readonly string[]).includes(item.portion);
            const isHalfChicken = item.product.category === 'chicken' && item.portion === 'half';
            return (
              <li key={item.product.id} className="space-y-2 text-sm">
                <p>
                  {item.quantity} ×{' '}
                  <span>
                    {item.product.name}
                    {item.product.isActive ? '' : ' (desactivado)'}
                  </span>
                  {item.portion !== null
                    ? ` — ${formatPortionCutLabel(item.portion, item.cut)}`
                    : ''}
                </p>
                {isSingleCutChicken && choice !== undefined && (
                  <LabeledSelect
                    id={`component-cut-${product.id}-${item.product.id}`}
                    label="Parte"
                    value={choice.cut}
                    onChange={(value) => {
                      const next = new Map(editor.componentChoices);
                      next.set(item.product.id, { ...choice, cut: value as Cut });
                      onChange({ ...editor, componentChoices: next });
                    }}
                  >
                    {/* El componente no trae su grilla de ofertas: son las dos
                        partes del dominio (la casa decide cuál reemplazar). */}
                    <option value="breast">{CUT_LABELS.breast}</option>
                    <option value="leg">{CUT_LABELS.leg}</option>
                  </LabeledSelect>
                )}
                {isHalfChicken && choice !== undefined && (
                  <LabeledSelect
                    id={`component-dist-${product.id}-${item.product.id}`}
                    label="Distribución"
                    value={`${choice.breastEighths}-${choice.legEighths}`}
                    onChange={(value) => {
                      const [breast, leg] = value.split('-').map(Number);
                      const next = new Map(editor.componentChoices);
                      next.set(item.product.id, {
                        ...choice,
                        breastEighths: breast!,
                        legEighths: leg!,
                      });
                      onChange({ ...editor, componentChoices: next });
                    }}
                  >
                    {DISTRIBUTIONS.map((dist) => (
                      <option key={dist.label} value={`${dist.breast}-${dist.leg}`}>
                        {dist.label}
                      </option>
                    ))}
                  </LabeledSelect>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {SAUCE_CATEGORIES.includes(product.category) && sauces.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Cremas</legend>
          {sauces.map((sauce) => {
            const checked = editor.sauces.has(sauce.id);
            return (
              <div key={sauce.id} className="space-y-2">
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = new Map(editor.sauces);
                      if (event.target.checked) next.set(sauce.id, 1);
                      else next.delete(sauce.id);
                      onChange({ ...editor, sauces: next });
                    }}
                  />
                  {sauce.name}
                </label>
                {checked && (
                  <LabeledInput
                    id={`sauce-qty-${product.id}-${sauce.id}`}
                    label="Cantidad"
                    inputMode="numeric"
                    value={String(editor.sauces.get(sauce.id) ?? 1)}
                    onChange={(event) => {
                      const next = new Map(editor.sauces);
                      next.set(sauce.id, Number(event.target.value) || 1);
                      onChange({ ...editor, sauces: next });
                    }}
                  />
                )}
              </div>
            );
          })}
        </fieldset>
      )}
      <div className="space-y-1">
        <LabeledInput
          id={`notes-${product.id}`}
          label="Observación"
          value={editor.notes}
          onChange={(event) => onChange({ ...editor, notes: event.target.value })}
        />
        <p className="text-sm text-muted">
          {editor.notes.length}/{ORDER_ITEM_NOTES_MAX}
        </p>
      </div>
      <Button className="min-h-12" onPress={onAdd}>
        Agregar al pedido
      </Button>
    </div>
  );
}

/** Cuerpo de un ítem del envío tal cual lo exige sendOrderItemsRequestSchema (D-011-08). */
function buildItemBody(line: CartLine) {
  const item: Record<string, unknown> = { productId: line.productId, quantity: line.quantity };
  if (line.portion !== null) item.portion = line.portion;
  if (line.portion !== null && (SINGLE_CUT_PORTIONS as readonly string[]).includes(line.portion))
    item.cut = line.cut;
  if (
    line.portion === 'half' &&
    (line.breastEighths !== DEFAULT_DISTRIBUTION.breast ||
      line.legEighths !== DEFAULT_DISTRIBUTION.leg)
  ) {
    item.breastEighths = line.breastEighths;
    item.legEighths = line.legEighths;
  }
  if (line.notes !== '') item.notes = line.notes;
  if (line.sauces.length > 0)
    item.sauces = line.sauces.map((sauce) => ({
      productId: sauce.productId,
      quantity: sauce.quantity,
    }));
  if (line.components !== null) item.components = line.components;
  return item;
}

/** El carrito armado por el mozo (D-011-07): líneas con precio, cantidad editable y quitar. */
function CartSection({
  lines,
  lineErrors,
  onQuantity,
  onRemove,
}: {
  lines: CartLine[];
  lineErrors: Map<number, string[]>;
  onQuantity: (key: number, value: string) => void;
  onRemove: (key: number) => void;
}) {
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-3">
      {lines.map((line, index) => {
        const portionLabel =
          line.portion !== null ? ` — ${formatPortionCutLabel(line.portion, line.cut)}` : '';
        const errors = lineErrors.get(index) ?? [];
        return (
          <li
            key={line.key}
            className="space-y-2 rounded-2xl border border-separator bg-surface px-4 py-3"
          >
            <p>
              {line.quantity} × <span>{line.productName}</span>
              {portionLabel} · {formatSoles(linePrice(line))}
            </p>
            {line.sauces.map((sauce) => (
              <p key={sauce.productId} className="text-sm text-muted">
                + {sauce.productName}
                {sauce.quantity > 1 ? ` × ${sauce.quantity}` : ''}
                {sauce.priceCents > 0 ? ` · ${formatSoles(sauce.quantity * sauce.priceCents)}` : ''}
              </p>
            ))}
            {line.notes !== '' && <p className="text-sm text-muted">{line.notes}</p>}
            {errors.map((message) => (
              <p key={message} role="alert" className="text-sm text-danger">
                {message}
              </p>
            ))}
            <div className="flex items-end gap-3">
              <div className="w-28">
                <LabeledInput
                  id={`cart-qty-${line.key}`}
                  label="Cantidad"
                  inputMode="numeric"
                  value={String(line.quantity)}
                  onChange={(event) => onQuantity(line.key, event.target.value)}
                />
              </div>
              <Button className="min-h-12" onPress={() => onRemove(line.key)}>
                Quitar
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Lectura laxa del salón para la toma de pedido: la página solo necesita la mesa
 * y el id de su pedido abierto; los ítems del pedido no interesan aquí.
 */
const takerTableSchema = z.looseObject({
  id: z.number().int().positive(),
  name: z.string(),
  isActive: z.boolean(),
  state: z.string(),
  order: z.looseObject({ id: z.number().int().positive() }).nullable(),
});
const takerTablesSchema = z.strictObject({ tables: z.array(takerTableSchema) });

async function getTakerTables() {
  const { body, status } = await apiClient.requestWithStatus('/tables');
  return parseResponse(takerTablesSchema, status, body).tables;
}

/**
 * POST /orders/<id>/items idempotente sin validar el cuerpo de respuesta: al
 * enviar solo importa el 201; la mesa vuelve a pedir el pedido actualizado.
 */
async function postOrderItems(orderId: number, key: string, body: unknown) {
  await apiClient.requestWithStatus(`/orders/${orderId}/items`, {
    method: 'POST',
    body,
    expectedStatus: 201,
    idempotencyKey: key,
  });
}

/** La toma de pedido: carta en secciones, editor por producto, carrito y envío idempotente. */
function OrderComposer({
  tableId,
  products,
  table,
}: {
  tableId: number;
  products: MenuProduct[];
  table: z.infer<typeof takerTableSchema> | undefined;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const orderId = table?.order?.id;
  const [editorProductId, setEditorProductId] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartError, setCartError] = useState<string>();
  const [sendErrors, setSendErrors] = useState<string[]>([]);
  const [lineErrors, setLineErrors] = useState<Map<number, string[]>>(new Map());
  const [sendFailed, setSendFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const pendingSend = useRef<{ body: unknown; key: string } | null>(null);
  const sending = useRef(false);
  const nextKey = useRef(1);

  const openEditor = (product: MenuProduct) => {
    setEditorProductId(product.id);
    setEditor(defaultEditorState(product));
  };

  const touchCart = (next: CartLine[]) => {
    setCart(next);
    pendingSend.current = null;
    setSendFailed(false);
    setSendErrors([]);
    setLineErrors(new Map());
    // El carrito cambió: el aviso de tope (u otro local) ya no corresponde.
    setCartError(undefined);
  };

  const addToCart = (product: MenuProduct) => {
    if (editor === null) return;
    if (cart.length >= ORDER_ITEMS_PER_SEND_MAX) {
      setCartError('Un envío admite hasta 20 ítems.');
      return;
    }
    setCartError(undefined);
    const quantity = Math.max(1, Math.floor(Number(editor.quantity) || 1));
    const sauces: CartSauce[] = [...editor.sauces.entries()].map(([productId, qty]) => {
      const sauce = products.find((candidate) => candidate.id === productId);
      return {
        productId,
        productName: sauce?.name ?? '',
        priceCents: sauce?.priceCents ?? 0,
        quantity: Math.max(1, Math.floor(qty)),
      };
    });
    // components solo si algún componente de pollo cambió de parte o distribución (D-011-08).
    let components: OrderItemComponentInput[] | null = null;
    const changed = product.items.some((item) => {
      const choice = editor.componentChoices.get(item.product.id);
      if (choice === undefined || item.portion === null) return false;
      if ((SINGLE_CUT_PORTIONS as readonly string[]).includes(item.portion))
        return choice.cut !== item.cut;
      if (item.portion === 'half')
        return (
          choice.breastEighths !== DEFAULT_DISTRIBUTION.breast ||
          choice.legEighths !== DEFAULT_DISTRIBUTION.leg
        );
      return false;
    });
    if (changed) {
      components = product.items.map((item: MenuComboItem) => {
        const row: Record<string, unknown> = {
          productId: item.product.id,
          quantity: item.quantity,
        };
        const choice = editor.componentChoices.get(item.product.id);
        if (item.portion !== null) {
          row.portion = item.portion;
          if ((SINGLE_CUT_PORTIONS as readonly string[]).includes(item.portion))
            row.cut = choice?.cut ?? item.cut ?? 'leg';
          if (item.portion === 'half') {
            row.breastEighths = choice?.breastEighths ?? DEFAULT_DISTRIBUTION.breast;
            row.legEighths = choice?.legEighths ?? DEFAULT_DISTRIBUTION.leg;
          }
        }
        return row as OrderItemComponentInput;
      });
    }
    const line: CartLine = {
      key: nextKey.current++,
      productId: product.id,
      productName: product.name,
      quantity,
      unitPriceCents: unitPrice(product, editor.portion, editor.cut),
      portion: editor.portion,
      cut: editor.cut,
      breastEighths: editor.breastEighths,
      legEighths: editor.legEighths,
      notes: editor.notes,
      sauces,
      components,
    };
    touchCart([...cart, line]);
  };

  const send = useMutation({
    mutationFn: (attempt: { body: unknown; key: string }) =>
      postOrderItems(orderId!, attempt.key, attempt.body),
    onSuccess: () => {
      setCart([]);
      pendingSend.current = null;
      setSendFailed(false);
      setSendErrors([]);
      setLineErrors(new Map());
      try {
        sessionStorage.setItem(NOTICE_KEY, SENT_NOTICE);
      } catch {
        // El aviso es un detalle: si el storage no está disponible la vuelta igual funciona.
      }
      void queryClient.invalidateQueries({ queryKey: ['waiter'] });
      router.push(`/mozo/mesas/${tableId}`);
    },
    onError: (error) => {
      setSendFailed(true);
      const issues = issuesFromApiError(error);
      const split = splitIssues(issues, 'items', cart.length);
      setLineErrors(split.byIndex);
      setSendErrors(issues.length > 0 ? uniqueMessages(split.root) : [apiErrorMessage(error)]);
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const doSend = () => {
    if (sending.current || send.isPending || orderId === undefined || cart.length === 0) return;
    if (pendingSend.current === null) {
      const body = { items: cart.map(buildItemBody) };
      const parsed = sendOrderItemsRequestSchema.safeParse(body);
      if (!parsed.success) {
        const split = splitIssues(issuesFromZod(parsed.error), 'items', cart.length);
        setLineErrors(split.byIndex);
        setSendErrors(uniqueMessages(split.root));
        return;
      }
      pendingSend.current = { body: parsed.data, key: createIdempotencyKey() };
    }
    sending.current = true;
    send.mutate(pendingSend.current);
  };

  const sauces = products.filter((product) => product.category === 'sauce');
  const normalizedSearch = search
    .trim()
    .toLocaleLowerCase('es-PE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const filteredProducts = products.filter((product) => {
    const nameMatches = product.name
      .toLocaleLowerCase('es-PE')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .includes(normalizedSearch);
    return nameMatches && (selectedCategory === 'all' || product.category === selectedCategory);
  });
  const shownCategories = PRODUCT_CATEGORIES.filter((category) =>
    filteredProducts.some((product) => product.category === category),
  );
  return (
    <>
      <h1 className="text-3xl font-bold">Agregar ítems</h1>
      {table !== undefined && <p>{table.name}</p>}
      <p>
        <Link href={`/mozo/mesas/${tableId}`} className="text-accent underline underline-offset-4">
          Volver al pedido
        </Link>
      </p>
      <div className="composer-layout">
        <nav className="composer-categories" aria-label="Categorías de la carta">
          <p>Carta</p>
          <button
            type="button"
            aria-pressed={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
          >
            Todo
          </button>
          {PRODUCT_CATEGORIES.filter((category) =>
            products.some((product) => product.category === category),
          ).map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={selectedCategory === category}
              onClick={() => setSelectedCategory(category)}
            >
              {PRODUCT_CATEGORY_LABELS[category]}
            </button>
          ))}
        </nav>
        <div className="composer-catalog">
          {products.length === 0 ? (
            <p>La carta está vacía.</p>
          ) : (
            <>
              <label className="composer-search">
                <span className="sr-only">Buscar producto</span>
                <input
                  type="search"
                  name="search"
                  role="searchbox"
                  aria-label="Buscar producto"
                  placeholder="Buscar producto…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {filteredProducts.length === 0 ? (
                <p className="composer-empty">No hay productos que coincidan con la búsqueda.</p>
              ) : null}
              {shownCategories.map((category) => {
                const section = filteredProducts.filter((product) => product.category === category);
                if (section.length === 0) return null;
                return (
                  <section key={category} className="composer-category-section space-y-3">
                    <h2 className="sr-only">{PRODUCT_CATEGORY_LABELS[category]}</h2>
                    <ul className="composer-product-grid" role="list">
                      {section.map((product) => (
                        <li key={product.id}>
                          <motion.button
                            type="button"
                            aria-label={product.name}
                            className="composer-product-card"
                            whileTap={{ scale: 0.985 }}
                            transition={{ duration: 0.12 }}
                            onClick={() => openEditor(product)}
                          >
                            {productImage(product) !== null && (
                              <span className="composer-product-image">
                                <Image
                                  src={productImage(product)!}
                                  alt={product.name}
                                  width={724}
                                  height={543}
                                  sizes="(max-width: 640px) 45vw, (max-width: 1199px) 32vw, 22vw"
                                />
                              </span>
                            )}
                            <span className="composer-product-name">{product.name}</span>
                            <span className="composer-product-price">
                              {product.category === 'chicken' ? (
                                <>
                                  <span>{formatSoles(product.priceCents)}</span>
                                  <small>{productCardPrice(product)}</small>
                                </>
                              ) : (
                                productCardPrice(product)
                              )}
                            </span>
                            <span className="composer-product-action">Elegir</span>
                          </motion.button>
                          {editorProductId === product.id && editor !== null && (
                            <div>
                              <ItemEditor
                                product={product}
                                sauces={sauces}
                                editor={editor}
                                onChange={setEditor}
                                onAdd={() => addToCart(product)}
                              />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </div>
        <aside className="composer-cart" aria-label="Pedido por enviar">
          <header className="composer-cart-heading">
            <p className="composer-cart-title">Tanda sin enviar</p>
            <p>
              {table?.name ?? 'Mesa'}
              {orderId !== undefined ? ` · Pedido #${orderId}` : ''}
            </p>
          </header>
          <section className="space-y-3">
            <CartSection
              lines={cart}
              lineErrors={lineErrors}
              onQuantity={(key, value) => {
                touchCart(
                  cart.map((line) =>
                    line.key === key
                      ? { ...line, quantity: Math.max(1, Math.floor(Number(value) || 1)) }
                      : line,
                  ),
                );
              }}
              onRemove={(key) => {
                touchCart(cart.filter((line) => line.key !== key));
              }}
            />
            {cart.length === 0 && (
              <p className="composer-cart-empty">Agrega productos de la carta.</p>
            )}
            <div className="composer-cart-total">
              <span>Total de tanda</span>
              <strong>
                {formatSoles(cart.reduce((total, line) => total + linePrice(line), 0))}
              </strong>
            </div>
            {cartError !== undefined && <p role="alert">{cartError}</p>}
            {sendFailed && (
              <div className="space-y-2">
                <p role="alert">No se pudo enviar el pedido.</p>
                {sendErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            {!sendFailed &&
              sendErrors.map((message) => (
                <p key={message} role="alert">
                  {message}
                </p>
              ))}
            <div className="flex flex-wrap gap-3">
              <Button
                className="min-h-12"
                isDisabled={cart.length === 0 || send.isPending || orderId === undefined}
                onPress={doSend}
              >
                {send.isPending ? 'Enviando...' : `Enviar a cocina (${cart.length})`}
              </Button>
              {sendFailed && (
                <Button className="min-h-12" isDisabled={send.isPending} onPress={doSend}>
                  Reintentar envío
                </Button>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

export default function Page() {
  // Carta y salón corren por encima del RoleGuard para que 'Cargando carta...'
  // sea el único role=status de la pantalla (el guard muestra 'Cargando...').
  const params = useParams();
  const tableId = Number(params.tableId);
  const menu = useQuery({ queryKey: ['waiter', 'menu'], queryFn: getMenu, retry: false });
  const tables = useQuery({
    queryKey: ['waiter', 'tables'],
    queryFn: getTakerTables,
    retry: false,
  });
  if (menu.isPending || tables.isPending)
    return (
      <ScreenState>
        <p role="status" className="p-6 text-center">
          Cargando carta...
        </p>
      </ScreenState>
    );
  if (menu.isError || tables.isError)
    return (
      <ScreenState>
        <div className="space-y-4 p-6 text-center">
          <p role="alert">
            {tables.isError ? 'No se pudo cargar el salón.' : 'No se pudo cargar la carta.'}
          </p>
          <Button
            className="min-h-12"
            onPress={() => {
              void (tables.isError ? tables : menu).refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      </ScreenState>
    );
  return (
    <RoleGuard area="/mozo">
      <OrderComposer
        tableId={tableId}
        products={menu.data}
        table={tables.data.find((candidate) => candidate.id === tableId)}
      />
    </RoleGuard>
  );
}
