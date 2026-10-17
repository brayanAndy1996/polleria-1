import { createHash } from 'node:crypto';
import { Op, QueryTypes, Transaction } from 'sequelize';
import {
  ERROR_CODES,
  ORDER_ACTIVE_ITEMS_MAX,
  PORTIONS,
  chickenConsumption,
  sendOrderItemsRequestSchema,
  voidOrderItemRequestSchema,
} from '@polleria/shared';
import type {
  Cut,
  KitchenTicket,
  KitchenTicketKind,
  Order,
  OrderItemInput,
  Portion,
  SendOrderItemsRequest,
} from '@polleria/shared';
import { AppError } from '../../errors/app-error.ts';
import type {
  ComboItemModel,
  Models,
  OrderItemModel,
  OrderModel,
  ProductModel,
  ProductPortionModel,
  TableModel,
} from '../../models/index.ts';
import { loadOrderViews, toOrderItems } from '../orders/order-view.ts';
import { createOrderNotFoundError, createOrderNotOpenError } from '../orders/order.service.ts';
import type { OrderActor } from '../orders/order.service.ts';
import type { KitchenTicketPrintService } from '../kitchen-ticket-prints/kitchen-ticket-print.service.ts';

/** El usuario de la sesión que ejecuta la operación (misma forma que OrderActor). */
export type OrderItemActor = OrderActor;

export interface OrderItemService {
  sendItems(
    orderId: number,
    body: unknown,
    key: string,
    actor: OrderItemActor,
  ): Promise<{ order: Order; ticket: KitchenTicket }>;
  requestVoid(
    orderId: number,
    itemId: number,
    body: unknown,
    key: string,
    actor: OrderItemActor,
  ): Promise<{ order: Order }>;
  voidItem(
    orderId: number,
    itemId: number,
    body: unknown,
    key: string,
    actor: OrderItemActor,
  ): Promise<{ order: Order; ticket: KitchenTicket }>;
  rejectVoid(
    orderId: number,
    itemId: number,
    key: string,
    actor: OrderItemActor,
  ): Promise<{ order: Order }>;
  listOrderTickets(orderId: number): Promise<{ tickets: KitchenTicket[] }>;
}

export function createOrderItemNotFoundError(): AppError {
  return new AppError({
    code: 'ORDER_ITEM_NOT_FOUND',
    message: 'Ese ítem no existe en este pedido.',
    httpStatus: 404,
  });
}
export function createOrderItemAlreadyVoidedError(): AppError {
  return new AppError({
    code: 'ORDER_ITEM_ALREADY_VOIDED',
    message: 'Ese ítem ya fue anulado.',
    httpStatus: 409,
  });
}
export function createOrderItemVoidRequestedError(): AppError {
  return new AppError({
    code: 'ORDER_ITEM_VOID_REQUESTED',
    message: 'Ese ítem ya tiene una anulación pendiente.',
    httpStatus: 409,
  });
}
export function createOrderItemNotRequestedError(): AppError {
  return new AppError({
    code: 'ORDER_ITEM_NOT_REQUESTED',
    message: 'Ese ítem no tiene una anulación pendiente.',
    httpStatus: 409,
  });
}
export function createOrderHasActiveItemsError(): AppError {
  return new AppError({
    code: 'ORDER_HAS_ACTIVE_ITEMS',
    message: 'El pedido tiene ítems sin anular; un administrador debe anularlos primero.',
    httpStatus: 409,
  });
}
export function createOrderItemsLimitError(): AppError {
  return new AppError({
    code: 'ORDER_ITEMS_LIMIT',
    message: 'El pedido llegó al límite de ítems.',
    httpStatus: 409,
  });
}
export function createIdempotencyConflictError(): AppError {
  return new AppError({
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Esa clave de envío ya se usó con otros datos.',
    httpStatus: 409,
  });
}

/** Los scopes de idempotencia: uno por operación que escribe ítems (D-010-08). */
const SCOPE_SEND = 'order-items';
const SCOPE_REQUEST = 'order-item-void-requests';
const SCOPE_VOID = 'order-item-voids';
const SCOPE_REJECT = 'order-item-void-rejections';

/**
 * Serialización estable del cuerpo ya validado para request_hash (D-010-08): el
 * JSON con las claves de cada objeto en orden alfabético, así dos cuerpos con el
 * mismo contenido producen el mismo hash sin importar el orden de sus claves.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (name) =>
          `${JSON.stringify(name)}:${stableStringify((value as Record<string, unknown>)[name])}`,
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHashOf(body: unknown): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

/** La fila de idempotency_keys ya registrada para un par (scope, key). */
interface StoredKey {
  order_id: number;
  request_hash: string;
  response_status: number;
  response_body: unknown;
}

/** Issue de validación con su ruta punteada, como los produce el errorHandler. */
interface Issue {
  path: string;
  message: string;
}

function validationIssues(issues: Issue[]): AppError {
  return new AppError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'Los datos enviados no son válidos.',
    httpStatus: 400,
    details: { issues },
  });
}

/**
 * Servicio de los ítems del pedido (spec 010): envío idempotente con precio y
 * nombre congelados (reglas 4 y 5), el ciclo solicitar/aprobar/rechazar anulación
 * con auditoría (regla 6) y el listado de comandas.
 *
 * Las cuatro operaciones de escritura comparten la misma estructura: dentro de
 * UNA transacción se intenta insertar la clave de idempotencia (ON CONFLICT DO
 * NOTHING); si la fila ya existía se lee bloqueada y se compara pedido y
 * request_hash —iguales es replay, distintos es 409— y solo el dueño de la clave
 * ejecuta la operación y guarda la respuesta completa en la misma fila. Como la
 * respuesta queda dentro de la transacción, un replay siempre ve el resultado
 * final y ninguna falla posterior deja la clave registrada a medias.
 *
 * Concurrencia: el dueño bloquea la fila del pedido con FOR NO KEY UPDATE —nunca
 * FOR UPDATE: las FK hacia orders dejan FOR KEY SHARE (lección de la 006)— antes
 * de tocar ítems o comandas, así dos operaciones sobre el mismo pedido se
 * serializan.
 */
/**
 * La firma de la fábrica, exportada también como tipo: las pruebas la referencian
 * en posición de tipo (`import('...').createOrderItemService`) para tipar el
 * servicio sin importar su valor — ahí solo se ven los exportados de tipo.
 */
interface OrderItemServiceDeps {
  models: Models;
  kitchenTicketPrintService?: KitchenTicketPrintService;
}
export type createOrderItemService = (deps: OrderItemServiceDeps) => OrderItemService;

export function createOrderItemService({
  models,
  kitchenTicketPrintService,
}: OrderItemServiceDeps): OrderItemService {
  const maybeSequelize = models.Order.sequelize;
  if (maybeSequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');
  const sequelize = maybeSequelize;
  const now = () => new Date();

  /**
   * Intenta registrar la clave. Devuelve 'claimed' si esta transacción es la
   * dueña, o la fila guardada si ya existía. El pedido inexistente se detecta
   * por la FK del insert y sale como ORDER_NOT_FOUND — un replay nunca puede
   * apuntar a un pedido que no existe, así la guardia de idempotencia sigue
   * siendo lo primero que corre (D-010-08).
   */
  async function claimKey(
    scope: string,
    key: string,
    orderId: number,
    requestHash: string,
    transaction: Transaction,
  ): Promise<'claimed' | StoredKey> {
    let inserted: unknown;
    try {
      [inserted] = await sequelize.query<{ id: number }>(
        'INSERT INTO idempotency_keys (scope, key, order_id, request_hash, response_status, ' +
          "response_body, created_at) VALUES (:scope, :key, :orderId, :requestHash, 0, '{}'::jsonb, " +
          'now()) ON CONFLICT (scope, key) DO NOTHING RETURNING id',
        {
          replacements: { scope, key, orderId, requestHash },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
    } catch (error) {
      const constraint = (error as { parent?: { constraint?: string } } | null)?.parent?.constraint;
      if (constraint === 'idempotency_keys_order_id_fkey') throw createOrderNotFoundError();
      throw error;
    }
    if (inserted !== undefined) return 'claimed';
    // La clave existe: la lectura bloqueada espera a que la transacción dueña
    // termine si aún está en vuelo, y entonces ve la respuesta ya guardada.
    const rows = await sequelize.query<StoredKey>(
      'SELECT order_id, request_hash, response_status, response_body FROM idempotency_keys ' +
        'WHERE scope = :scope AND key = :key FOR NO KEY UPDATE',
      { replacements: { scope, key }, type: QueryTypes.SELECT, transaction },
    );
    const stored = rows[0];
    if (stored === undefined) throw new Error('La clave de idempotencia desapareció.');
    if (stored.order_id !== orderId || stored.request_hash !== requestHash)
      throw createIdempotencyConflictError();
    return stored;
  }

  /** Guarda la respuesta final en la fila de la clave reclamada. */
  async function storeResponse(
    scope: string,
    key: string,
    status: number,
    body: unknown,
    transaction: Transaction,
  ): Promise<void> {
    await sequelize.query(
      'UPDATE idempotency_keys SET response_status = :status, response_body = :body::jsonb ' +
        'WHERE scope = :scope AND key = :key',
      {
        replacements: { status, body: JSON.stringify(body), scope, key },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );
  }

  /** La fila del pedido bloqueada y verificada abierta (misma regla que order.service). */
  async function openOrderRow(orderId: number, transaction: Transaction): Promise<OrderModel> {
    const order = await models.Order.findByPk(orderId, {
      lock: Transaction.LOCK.NO_KEY_UPDATE,
      transaction,
    });
    if (order === null) throw createOrderNotFoundError();
    if (order.status !== 'open') throw createOrderNotOpenError();
    return order;
  }

  /** La forma pública del pedido dentro de la transacción activa. */
  async function viewOf(orderId: number, transaction: Transaction): Promise<Order> {
    const row = await models.Order.findByPk(orderId, { transaction });
    if (row === null) throw createOrderNotFoundError();
    const views = await loadOrderViews(models, [row], { transaction });
    const view = views.get(orderId);
    if (view === undefined) throw new Error(`No se pudo armar la vista del pedido ${orderId}.`);
    return view;
  }

  /** La forma pública de una comanda con sus ítems, dentro de la transacción. */
  async function ticketOf(
    ticket: {
      id: number;
      orderId: number;
      kind: KitchenTicketKind;
      createdByUserId: number;
      createdAt: Date;
    },
    transaction: Transaction,
  ): Promise<KitchenTicket> {
    const items = await itemsOfTicket(ticket.id, ticket.kind, transaction);
    const creator = await models.User.findByPk(ticket.createdByUserId, {
      attributes: ['id', 'displayName'],
      transaction,
    });
    return {
      id: ticket.id,
      orderId: ticket.orderId,
      kind: ticket.kind,
      items,
      createdBy:
        creator === null
          ? { id: ticket.createdByUserId, displayName: '?' }
          : { id: creator.id, displayName: creator.displayName },
      createdAt: ticket.createdAt.toISOString(),
    };
  }

  /** Los ítems que la comanda lista: por comanda de envío o por comanda de anulación. */
  async function itemsOfTicket(
    ticketId: number,
    kind: KitchenTicketKind,
    transaction?: Transaction,
  ) {
    const rows = await models.OrderItem.findAll({
      where: kind === 'void' ? { voidTicketId: ticketId } : { kitchenTicketId: ticketId },
      transaction,
    });
    return toOrderItems(models, rows, { transaction });
  }

  /** El ítem del pedido, o 404 (ORDER_ITEM_NOT_FOUND); se lee ya bloqueado el pedido. */
  async function lockedItem(
    orderId: number,
    itemId: number,
    transaction: Transaction,
  ): Promise<OrderItemModel> {
    const item = await models.OrderItem.findOne({
      where: { id: itemId, orderId },
      transaction,
    });
    if (item === null) throw createOrderItemNotFoundError();
    return item;
  }

  /** Limpia el par "cuenta pedida" cuando el pedido cambia (D-010-13). */
  async function clearBillPair(orderId: number, transaction: Transaction): Promise<void> {
    await models.Order.update(
      { billRequestedAt: null, billRequestedByUserId: null },
      {
        where: { id: orderId, billRequestedAt: { [Op.ne]: null } },
        transaction,
      },
    );
  }

  // ---- Resolución de ítems del envío -------------------------------------

  interface ResolvedItem {
    product: ProductModel;
    quantity: number;
    priceCents: number;
    portion: Portion | null;
    cut: Cut | null;
    breastEighths: number;
    legEighths: number;
    notes: string | null;
    sauces: { productId: number; productName: string; quantity: number; priceCents: number }[];
    components: {
      productId: number;
      productName: string;
      quantity: number;
      portion: Portion | null;
      cut: Cut | null;
      breastEighths: number;
      legEighths: number;
    }[];
  }

  /**
   * Los octavos resueltos de una porción de pollo por UNIDAD: eighth/quarter van
   * todos a la parte elegida; half usa la distribución indicada o 2+2; whole es
   * siempre 4+4 (regla 1 y D-010-04).
   */
  function eighthsOf(
    portion: Portion,
    cut: Cut | null,
    breastEighths?: number,
    legEighths?: number,
  ): { breastEighths: number; legEighths: number } {
    if (portion === 'half') {
      const breast = breastEighths ?? 2;
      const leg = legEighths ?? 2;
      return { breastEighths: breast, legEighths: leg };
    }
    const consumption = chickenConsumption(portion, cut);
    return consumption;
  }

  return {
    async sendItems(orderId, body, key, actor) {
      const parsed: SendOrderItemsRequest = sendOrderItemsRequestSchema.parse(body);
      const requestHash = requestHashOf(parsed);
      return sequelize.transaction(async (transaction) => {
        const claim = await claimKey(SCOPE_SEND, key, orderId, requestHash, transaction);
        if (claim !== 'claimed')
          return claim.response_body as { order: Order; ticket: KitchenTicket };

        const order = await openOrderRow(orderId, transaction);
        const items = parsed.items;
        // El tope cuenta los activos ('sent' y 'void_requested'; los anulados no).
        const active = await models.OrderItem.count({
          where: { orderId, status: { [Op.in]: ['sent', 'void_requested'] } },
          transaction,
        });
        if (active + items.length > ORDER_ACTIVE_ITEMS_MAX) throw createOrderItemsLimitError();

        // Carga por lote: todos los productos referenciados (ítems, cremas y
        // componentes), las presentaciones de los pollos y los componentes de los
        // combos en una sola consulta por tabla (D-010-05).
        const referencedIds = new Set<number>();
        for (const item of items) {
          referencedIds.add(item.productId);
          for (const sauce of item.sauces ?? []) referencedIds.add(sauce.productId);
          for (const component of item.components ?? []) referencedIds.add(component.productId);
        }
        const products = await models.Product.findAll({
          where: { id: { [Op.in]: [...referencedIds] } },
          transaction,
        });
        const productById = new Map(products.map((product) => [product.id, product]));
        const portions = await models.ProductPortion.findAll({
          where: { productId: { [Op.in]: [...referencedIds] } },
          transaction,
        });
        const portionsByProduct = new Map<number, ProductPortionModel[]>();
        for (const portion of portions) {
          const list = portionsByProduct.get(portion.productId) ?? [];
          list.push(portion);
          portionsByProduct.set(portion.productId, list);
        }
        const comboIds = products
          .filter((product) => product.category === 'combo')
          .map((product) => product.id);
        const comboItemRows =
          comboIds.length === 0
            ? []
            : await models.ComboItem.findAll({
                where: { comboId: { [Op.in]: comboIds } },
                order: [['id', 'ASC']],
                transaction,
              });
        const comboItemsByCombo = new Map<number, ComboItemModel[]>();
        for (const row of comboItemRows) {
          const list = comboItemsByCombo.get(row.comboId) ?? [];
          list.push(row);
          comboItemsByCombo.set(row.comboId, list);
        }
        // Los productos componentes de los combos (para copiar su nombre).
        const componentIds = [...new Set(comboItemRows.map((row) => row.productId))];
        const componentProducts =
          componentIds.length === 0
            ? []
            : await models.Product.findAll({
                where: { id: { [Op.in]: componentIds } },
                transaction,
              });
        for (const product of componentProducts)
          if (!productById.has(product.id)) productById.set(product.id, product);

        // Acumulación de issues por D-010-18, en el orden de la tabla.
        const issues: Issue[] = [];
        const resolved: (ResolvedItem | undefined)[] = items.map(() => undefined);

        items.forEach((item, index) => {
          const path = `items.${index}`;
          const product = productById.get(item.productId);
          if (product === undefined) {
            issues.push({ path: `${path}.productId`, message: 'Ese producto no existe.' });
            return;
          }
          if (!product.isActive) {
            issues.push({
              path: `${path}.productId`,
              message: 'Ese producto está desactivado en la carta.',
            });
            return;
          }
          const offered = portionsByProduct.get(product.id) ?? [];
          const isPortionedChicken = product.category === 'chicken' && offered.length > 0;
          if (isPortionedChicken) {
            if (item.portion === undefined) {
              issues.push({
                path: `${path}.portion`,
                message: 'El pollo lleva presentación (eighth, quarter, half o whole).',
              });
            } else if (
              !(PORTIONS as readonly string[]).includes(item.portion) ||
              !offered.some((row) => row.portion === item.portion && row.cut === (item.cut ?? null))
            ) {
              issues.push({
                path: `${path}.portion`,
                message: 'Esa presentación no está en la carta de este producto.',
              });
            }
          } else if (item.portion !== undefined || item.cut !== undefined) {
            issues.push({
              path: `${path}.portion`,
              message: 'Este producto no lleva presentación ni parte.',
            });
          }
          const hasEighths = item.breastEighths !== undefined || item.legEighths !== undefined;
          if (hasEighths) {
            if (item.portion !== 'half') {
              issues.push({
                path: `${path}.breastEighths`,
                message: 'La distribución de partes solo se indica en el medio pollo.',
              });
            } else if (
              item.breastEighths === undefined ||
              item.legEighths === undefined ||
              item.breastEighths + item.legEighths !== 4
            ) {
              issues.push({
                path: `${path}.breastEighths`,
                message: 'La distribución del medio debe sumar 4 octavos entre pecho y pierna.',
              });
            }
          }
          if (item.components !== undefined && product.category !== 'combo')
            issues.push({
              path: `${path}.components`,
              message: 'Solo los combos llevan componentes.',
            });
          if (item.sauces !== undefined) {
            if (!['chicken', 'dish', 'combo'].includes(product.category))
              issues.push({
                path: `${path}.sauces`,
                message: 'Las cremas solo van con platos, pollo o combos.',
              });
            if (item.sauces.length > 6)
              issues.push({
                path: `${path}.sauces`,
                message: 'Un ítem admite hasta 6 cremas.',
              });
            const seen = new Set<number>();
            for (const sauce of item.sauces)
              if (seen.has(sauce.productId)) {
                issues.push({
                  path: `${path}.sauces`,
                  message: 'Hay cremas repetidas en el ítem.',
                });
                break;
              } else seen.add(sauce.productId);
            item.sauces.forEach((sauce, sauceIndex) => {
              const sauceProduct = productById.get(sauce.productId);
              if (sauceProduct === undefined) {
                issues.push({
                  path: `${path}.sauces.${sauceIndex}.productId`,
                  message: 'Esa crema no existe.',
                });
              } else if (!sauceProduct.isActive) {
                issues.push({
                  path: `${path}.sauces.${sauceIndex}.productId`,
                  message: 'Esa crema está desactivada en la carta.',
                });
              } else if (sauceProduct.category !== 'sauce') {
                issues.push({
                  path: `${path}.sauces.${sauceIndex}.productId`,
                  message: 'Ese producto no es una crema.',
                });
              }
            });
          }
          if (issues.some((issue) => issue.path.startsWith(path))) return;
          resolved[index] = resolveItem(item, product, isPortionedChicken, offered, productById);
          // Componentes del combo: la lista debe reflejar la de la carta
          // (mismo productId, portion y quantity por posición); la parte solo puede
          // cambiar en componentes de pollo (D-010-05).
          if (product.category === 'combo') {
            const carta = comboItemsByCombo.get(product.id) ?? [];
            interface ComponentGiven {
              productId: number;
              quantity: number;
              portion?: Portion | undefined;
              cut?: Cut | undefined;
              breastEighths?: number | undefined;
              legEighths?: number | undefined;
            }
            const input: ComponentGiven[] =
              item.components ??
              carta.map((row) => ({
                productId: row.productId,
                quantity: row.quantity,
                portion: row.portion ?? undefined,
                cut: row.cut ?? undefined,
              }));
            const matches =
              item.components === undefined ||
              (input.length === carta.length &&
                carta.every((row, position) => {
                  const given = input[position];
                  return (
                    given !== undefined &&
                    given.productId === row.productId &&
                    (given.portion ?? null) === row.portion &&
                    given.quantity === row.quantity &&
                    (row.portion !== null ||
                      ((given.cut ?? null) === row.cut &&
                        given.breastEighths === undefined &&
                        given.legEighths === undefined))
                  );
                }));
            // La distribución de octavos de un componente sigue la misma regla
            // que la del ítem de línea (regla 1): solo en el medio y sumando 4.
            let componentIssue = false;
            for (const given of input) {
              const hasEighths =
                given.breastEighths !== undefined || given.legEighths !== undefined;
              if (!hasEighths) continue;
              if ((given.portion ?? null) !== 'half') {
                componentIssue = true;
                issues.push({
                  path: `${path}.components`,
                  message: 'La distribución de partes solo se indica en el medio pollo.',
                });
                break;
              }
              if (
                given.breastEighths === undefined ||
                given.legEighths === undefined ||
                given.breastEighths + given.legEighths !== 4
              ) {
                componentIssue = true;
                issues.push({
                  path: `${path}.components`,
                  message: 'La distribución del medio debe sumar 4 octavos entre pecho y pierna.',
                });
                break;
              }
            }
            if (componentIssue) return;
            if (!matches) {
              issues.push({
                path: `${path}.components`,
                message: 'Los componentes no coinciden con el combo de la carta.',
              });
              return;
            }
            resolved[index].components = carta.map((row, position) => {
              const given = input[position];
              const componentProduct = productById.get(row.productId);
              const cut: Cut | null = row.portion === null ? null : (given?.cut ?? null);
              const zero = { breastEighths: 0, legEighths: 0 };
              const unitEighths =
                row.portion === null
                  ? zero
                  : eighthsOf(row.portion, cut, given?.breastEighths, given?.legEighths);
              return {
                productId: row.productId,
                productName: componentProduct?.name ?? '?',
                quantity: row.quantity,
                portion: row.portion,
                cut,
                breastEighths: unitEighths.breastEighths * row.quantity,
                legEighths: unitEighths.legEighths * row.quantity,
              };
            });
            resolved[index].breastEighths = resolved[index].components.reduce(
              (sum, row) => sum + row.breastEighths,
              0,
            );
            resolved[index].legEighths = resolved[index].components.reduce(
              (sum, row) => sum + row.legEighths,
              0,
            );
          }
        });
        if (issues.length > 0) throw validationIssues(issues);

        const hasTickets = await models.KitchenTicket.count({
          where: { orderId, kind: { [Op.in]: ['initial', 'additional'] } },
          transaction,
        });
        const ticket = await models.KitchenTicket.create(
          {
            orderId,
            kind: hasTickets === 0 ? 'initial' : 'additional',
            createdByUserId: actor.userId,
          },
          { transaction },
        );
        // La mesa de origen: la de menor id entre las que cubren el pedido.
        const orderedAtTableId = await models.Table.min<number | null, TableModel>('id', {
          where: { currentOrderId: orderId },
          transaction,
        });
        for (const [index, item] of items.entries()) {
          const detail = resolved[index]!;
          const row = await models.OrderItem.create(
            {
              orderId,
              productId: item.productId,
              productName: detail.product.name,
              productCategory: detail.product.category,
              quantity: item.quantity,
              priceCents: detail.priceCents,
              portion: detail.portion,
              cut: detail.cut,
              breastEighths: detail.breastEighths,
              legEighths: detail.legEighths,
              notes: item.notes ?? null,
              status: 'sent',
              kitchenTicketId: ticket.id,
              orderedAtTableId: orderedAtTableId ?? null,
              createdByUserId: actor.userId,
            },
            { transaction },
          );
          if (detail.sauces.length > 0)
            await models.OrderItemSauce.bulkCreate(
              detail.sauces.map((sauce) => ({
                orderItemId: row.id,
                productId: sauce.productId,
                productName: sauce.productName,
                quantity: sauce.quantity,
                priceCents: sauce.priceCents,
              })),
              { transaction },
            );
          if (detail.components.length > 0)
            await models.OrderItemComponent.bulkCreate(
              detail.components.map((component) => ({
                orderItemId: row.id,
                productId: component.productId,
                productName: component.productName,
                quantity: component.quantity,
                portion: component.portion,
                cut: component.cut,
                breastEighths: component.breastEighths,
                legEighths: component.legEighths,
              })),
              { transaction },
            );
        }
        await clearBillPair(orderId, transaction);
        const response = {
          order: await viewOf(order.id, transaction),
          ticket: await ticketOf(ticket, transaction),
        };
        await kitchenTicketPrintService?.enqueue(
          {
            version: 1,
            ticket: response.ticket,
            orderIdAtIssue: orderId,
            tablesAtIssue: response.order.tables,
          },
          transaction,
        );
        await storeResponse(SCOPE_SEND, key, 201, response, transaction);
        return response;
      });
    },

    async requestVoid(orderId, itemId, body, key, actor) {
      const { reason } = voidOrderItemRequestSchema.parse(body);
      // El hash cubre también el ítem de la ruta: la misma clave y motivo sobre
      // OTRO itemId es conflicto, no replay (D-010-08).
      const requestHash = requestHashOf({ itemId, reason });
      return sequelize.transaction(async (transaction) => {
        const claim = await claimKey(SCOPE_REQUEST, key, orderId, requestHash, transaction);
        if (claim !== 'claimed') return claim.response_body as { order: Order };
        await openOrderRow(orderId, transaction);
        const item = await lockedItem(orderId, itemId, transaction);
        if (item.status === 'voided') throw createOrderItemAlreadyVoidedError();
        if (item.status === 'void_requested') throw createOrderItemVoidRequestedError();
        await item.update(
          {
            status: 'void_requested',
            voidRequestedAt: now(),
            voidRequestedByUserId: actor.userId,
            voidRequestReason: reason,
          },
          { transaction },
        );
        const response = { order: await viewOf(orderId, transaction) };
        await storeResponse(SCOPE_REQUEST, key, 200, response, transaction);
        return response;
      });
    },

    async voidItem(orderId, itemId, body, key, actor) {
      const { reason } = voidOrderItemRequestSchema.parse(body);
      const requestHash = requestHashOf({ itemId, reason });
      return sequelize.transaction(async (transaction) => {
        const claim = await claimKey(SCOPE_VOID, key, orderId, requestHash, transaction);
        if (claim !== 'claimed')
          return claim.response_body as { order: Order; ticket: KitchenTicket };
        await openOrderRow(orderId, transaction);
        const item = await lockedItem(orderId, itemId, transaction);
        if (item.status === 'voided') throw createOrderItemAlreadyVoidedError();
        const ticket = await models.KitchenTicket.create(
          { orderId, kind: 'void', createdByUserId: actor.userId },
          { transaction },
        );
        await item.update(
          {
            status: 'voided',
            voidTicketId: ticket.id,
            voidedAt: now(),
            voidedByUserId: actor.userId,
            voidReason: reason,
          },
          { transaction },
        );
        await clearBillPair(orderId, transaction);
        const response = {
          order: await viewOf(orderId, transaction),
          ticket: await ticketOf(ticket, transaction),
        };
        await kitchenTicketPrintService?.enqueue(
          {
            version: 1,
            ticket: response.ticket,
            orderIdAtIssue: orderId,
            tablesAtIssue: response.order.tables,
          },
          transaction,
        );
        await storeResponse(SCOPE_VOID, key, 200, response, transaction);
        return response;
      });
    },

    async rejectVoid(orderId, itemId, key) {
      // Sin cuerpo: el hash cubre el ítem de la ruta (D-010-08).
      const requestHash = requestHashOf({ itemId });
      return sequelize.transaction(async (transaction) => {
        const claim = await claimKey(SCOPE_REJECT, key, orderId, requestHash, transaction);
        if (claim !== 'claimed') return claim.response_body as { order: Order };
        await openOrderRow(orderId, transaction);
        const item = await lockedItem(orderId, itemId, transaction);
        if (item.status === 'voided') throw createOrderItemAlreadyVoidedError();
        if (item.status === 'sent') throw createOrderItemNotRequestedError();
        await item.update(
          {
            status: 'sent',
            voidRequestedAt: null,
            voidRequestedByUserId: null,
            voidRequestReason: null,
          },
          { transaction },
        );
        const response = { order: await viewOf(orderId, transaction) };
        await storeResponse(SCOPE_REJECT, key, 200, response, transaction);
        return response;
      });
    },

    async listOrderTickets(orderId) {
      const order = await models.Order.findByPk(orderId, { attributes: ['id'] });
      if (order === null) throw createOrderNotFoundError();
      const ticketRows = await models.KitchenTicket.findAll({
        where: { orderId },
        order: [['id', 'ASC']],
      });
      const tickets = await Promise.all(
        ticketRows.map((ticket) =>
          sequelize.transaction(async (transaction) => ticketOf(ticket, transaction)),
        ),
      );
      return { tickets };
    },
  };

  /** Resuelve el ítem validado contra la carta: precio, presentación y octavos. */
  function resolveItem(
    item: OrderItemInput,
    product: ProductModel,
    isPortionedChicken: boolean,
    offered: ProductPortionModel[],
    productById: Map<number, ProductModel>,
  ): ResolvedItem {
    const detail: ResolvedItem = {
      product,
      quantity: item.quantity,
      priceCents: product.priceCents,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
      notes: item.notes ?? null,
      // Nombre y precio de cada crema copiados al enviar, como el del ítem (regla 4).
      sauces: (item.sauces ?? []).map((sauce) => {
        const sauceProduct = productById.get(sauce.productId);
        return {
          productId: sauce.productId,
          productName: sauceProduct?.name ?? '?',
          quantity: sauce.quantity,
          priceCents: sauceProduct?.priceCents ?? 0,
        };
      }),
      components: [],
    };
    if (isPortionedChicken && item.portion !== undefined) {
      const row = offered.find(
        (offeredRow) =>
          offeredRow.portion === item.portion && offeredRow.cut === (item.cut ?? null),
      );
      const portion = row?.portion ?? item.portion;
      detail.priceCents = row?.priceCents ?? product.priceCents;
      detail.portion = portion;
      detail.cut = item.cut ?? null;
      const unit = eighthsOf(portion, detail.cut, item.breastEighths, item.legEighths);
      detail.breastEighths = unit.breastEighths * item.quantity;
      detail.legEighths = unit.legEighths * item.quantity;
    }
    return detail;
  }
}
