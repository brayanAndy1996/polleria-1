import { createHash } from 'node:crypto';
import { Op, QueryTypes, Transaction } from 'sequelize';
import {
  applyInventoryDelta,
  chickenBatchEighths,
  hasAnyRole,
  idempotencyKeySchema,
  inventoryAdjustmentRequestSchema,
  inventoryBatchRequestSchema,
  inventoryControlRequestSchema,
  inventoryReceiptRequestSchema,
  inventoryQuerySchema,
  inventoryMovementSchema,
  inventoryMutationResponseSchema,
  inventorySnapshotSchema,
} from '@polleria/shared';
import type {
  InventoryKind,
  InventoryDemand,
  InventoryMovement,
  InventoryMutationResponse,
  InventorySnapshot,
  InventoryMovementsResponse,
  UserRole,
} from '@polleria/shared';
import type { Models, UserModel, InventoryMovementModel } from '../../models/index.ts';
import { AppError } from '../../errors/app-error.ts';
import { createForbiddenError } from '../orders/order.service.ts';
import { createIdempotencyConflictError } from '../order-items/order-item.service.ts';
import { createProductNotFoundError } from '../products/product.service.ts';

export interface InventoryActor {
  userId: number;
}
export interface InventoryService {
  getInventory(actor: InventoryActor): Promise<InventorySnapshot>;
  getAvailability(actor: InventoryActor): Promise<InventorySnapshot>;
  listMovements(
    afterId: number | undefined,
    actor: InventoryActor,
  ): Promise<InventoryMovementsResponse>;
  setChickenControl(
    body: unknown,
    key: string,
    actor: InventoryActor,
  ): Promise<InventoryMutationResponse>;
  setDrinkControl(
    productId: number,
    body: unknown,
    key: string,
    actor: InventoryActor,
  ): Promise<InventoryMutationResponse>;
  addChickenBatch(
    body: unknown,
    key: string,
    actor: InventoryActor,
  ): Promise<InventoryMutationResponse>;
  addDrinkReceipt(
    productId: number,
    body: unknown,
    key: string,
    actor: InventoryActor,
  ): Promise<InventoryMutationResponse>;
  adjust(body: unknown, key: string, actor: InventoryActor): Promise<InventoryMutationResponse>;
  consume(
    demand: InventoryDemand,
    ticketId: number,
    actor: InventoryActor,
    transaction: Transaction,
  ): Promise<void>;
}

function inventoryError(code: string, message: string) {
  return new AppError({ code, message, httpStatus: 409 });
}
function requireEnabled(enabled: boolean) {
  if (!enabled)
    throw inventoryError(
      'INVENTORY_DISABLED',
      'Activa el control de stock antes de registrar este movimiento.',
    );
}
function nextQuantity(quantity: number, delta: number) {
  try {
    return applyInventoryDelta(quantity, delta);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw inventoryError(
      'INVENTORY_QUANTITY_OUT_OF_RANGE',
      'El movimiento deja el stock fuera del rango permitido.',
    );
  }
}
function movementView(row: InventoryMovementModel): InventoryMovement {
  return inventoryMovementSchema.parse({
    id: row.id,
    kind: row.kind,
    productId: row.productId,
    productName: row.productName,
    type: row.type,
    delta: row.delta,
    quantityAfter: row.quantityAfter,
    enabledAfter: row.enabledAfter,
    reason: row.reason,
    actor: { id: row.actorUserId, displayName: row.actorDisplayName },
    ticketId: row.ticketId,
    createdAt: row.createdAt.toISOString(),
  });
}
type MovementInput = {
  kind: InventoryKind;
  productId: number | null;
  delta: number;
  type: 'control' | 'batch' | 'receipt' | 'adjustment';
  enabled?: boolean;
};

export function createInventoryService({
  models,
  now = () => new Date(),
}: {
  models: Models;
  now?: () => Date;
}): InventoryService {
  const sequelize = models.InventoryState.sequelize;
  if (sequelize === undefined)
    throw new Error('Los modelos no están vinculados a una conexión de Sequelize.');

  async function authorized(actor: InventoryActor, roles: UserRole[], transaction: Transaction) {
    const user = await models.User.findByPk(actor.userId, { transaction });
    if (user === null || !user.isActive || !hasAnyRole(user.roles, roles))
      throw createForbiddenError();
    return user;
  }
  async function snapshot(transaction: Transaction): Promise<InventorySnapshot> {
    const state = await models.InventoryState.findByPk(1, { transaction });
    if (state === null) throw new Error('Falta el estado inicial del inventario.');
    const products = await models.Product.findAll({
      where: { category: 'drink' },
      order: [['id', 'ASC']],
      transaction,
    });
    const drinks = await models.InventoryDrink.findAll({ transaction });
    const byId = new Map(drinks.map((drink) => [drink.productId, drink]));
    return inventorySnapshotSchema.parse({
      chicken: {
        enabled: state.chickenEnabled,
        breastEighths: state.breastEighths,
        legEighths: state.legEighths,
      },
      drinks: products.map((product) => ({
        productId: product.id,
        productName: product.name,
        enabled: byId.get(product.id)?.enabled ?? false,
        quantity: byId.get(product.id)?.quantity ?? 0,
      })),
      generatedAt: now().toISOString(),
    });
  }
  async function read(actor: InventoryActor, roles: UserRole[]) {
    return sequelize!.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
      async (transaction) => {
        await authorized(actor, roles, transaction);
        return snapshot(transaction);
      },
    );
  }

  async function mutate(
    route: string,
    body: unknown,
    reason: string,
    key: string,
    actor: InventoryActor,
    inputs: MovementInput[],
    status: 200 | 201,
  ) {
    idempotencyKeySchema.parse(key);
    const requestHash = createHash('sha256').update(JSON.stringify({ route, body })).digest('hex');
    return sequelize!.transaction(async (transaction) => {
      const user: UserModel = await authorized(actor, ['admin'], transaction);
      const [inserted] = await sequelize!.query<{ key: string }>(
        'INSERT INTO inventory_commands (key, request_hash, response_status, response_body, actor_user_id, created_at) ' +
          "VALUES (:key,:requestHash,0,'{}'::jsonb,:actorId,:createdAt) ON CONFLICT (key) DO NOTHING RETURNING key",
        {
          replacements: { key, requestHash, actorId: user.id, createdAt: now() },
          transaction,
          type: QueryTypes.SELECT,
        },
      );
      const command = await models.InventoryCommand.findByPk(key, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (command === null) throw new Error('La clave de inventario desapareció.');
      if (inserted === undefined) {
        if (command.requestHash !== requestHash) throw createIdempotencyConflictError();
        return inventoryMutationResponseSchema.parse(command.responseBody);
      }
      // Puerta común para entradas, ajustes, controles y el futuro consumo del envío.
      const state = await models.InventoryState.findByPk(1, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (state === null) throw new Error('Falta el estado inicial del inventario.');
      const movements: InventoryMovement[] = [];
      for (const input of inputs) {
        let productName: string | null = null;
        let quantityAfter: number;
        if (input.kind === 'drink') {
          const product = await models.Product.findByPk(input.productId!, {
            transaction,
            lock: Transaction.LOCK.KEY_SHARE,
          });
          if (product === null) throw createProductNotFoundError();
          if (product.category !== 'drink')
            throw inventoryError(
              'INVENTORY_PRODUCT_INVALID',
              'El control por unidades solo se aplica a bebidas.',
            );
          productName = product.name;
          let drink = await models.InventoryDrink.findByPk(product.id, {
            transaction,
            lock: Transaction.LOCK.UPDATE,
          });
          if (input.type === 'control') {
            if (drink === null)
              drink = await models.InventoryDrink.create(
                { productId: product.id },
                { transaction },
              );
            await drink.update({ enabled: input.enabled! }, { transaction });
            quantityAfter = drink.quantity;
          } else {
            requireEnabled(drink?.enabled ?? false);
            quantityAfter = nextQuantity(drink!.quantity, input.delta);
            await drink!.update({ quantity: quantityAfter }, { transaction });
          }
        } else {
          const field = input.kind === 'breast' ? 'breastEighths' : 'legEighths';
          quantityAfter = state[field];
          if (input.type === 'control')
            await state.update({ chickenEnabled: input.enabled! }, { transaction });
          else {
            requireEnabled(state.chickenEnabled);
            quantityAfter = nextQuantity(quantityAfter, input.delta);
            await state.update({ [field]: quantityAfter }, { transaction });
          }
        }
        const movement = await models.InventoryMovement.create(
          {
            kind: input.kind,
            productId: input.productId,
            productName,
            type: input.type,
            delta: input.delta,
            quantityAfter,
            enabledAfter: input.enabled ?? null,
            reason,
            actorUserId: user.id,
            actorDisplayName: user.displayName,
            ticketId: null,
            createdAt: now(),
          },
          { transaction },
        );
        movements.push(movementView(movement));
      }
      const response = inventoryMutationResponseSchema.parse({
        inventory: await snapshot(transaction),
        movements,
      });
      await command.update({ responseStatus: status, responseBody: response }, { transaction });
      return response;
    });
  }

  return {
    async consume(demand, ticketId, actor, transaction) {
      const user = await authorized(actor, ['waiter', 'admin'], transaction);
      const state = await models.InventoryState.findByPk(1, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (state === null) throw new Error('Falta el estado inicial del inventario.');
      // Las FK del movimiento toman KEY SHARE sobre products. Tomarlo antes de
      // bloquear las filas hijas evita invertir el orden de una recategorización.
      const products = await models.Product.findAll({
        where: { id: { [Op.in]: demand.drinks.map((drink) => drink.productId) } },
        order: [['id', 'ASC']],
        transaction,
        lock: Transaction.LOCK.KEY_SHARE,
      });
      const productById = new Map(products.map((product) => [product.id, product]));
      const drinks = await models.InventoryDrink.findAll({
        where: {
          productId: { [Op.in]: demand.drinks.map((drink) => drink.productId) },
          enabled: true,
        },
        order: [['productId', 'ASC']],
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (state.chickenEnabled && demand.undefinedChickenProductIds.length > 0)
        throw new AppError({
          code: 'STOCK_CONSUMPTION_UNDEFINED',
          message: 'Configura el consumo de pollo antes de vender este producto.',
          httpStatus: 409,
          details: { productIds: demand.undefinedChickenProductIds },
        });

      const shortages: {
        kind: InventoryKind;
        productId: number | null;
        available: number;
        required: number;
      }[] = [];
      if (state.chickenEnabled) {
        if (state.breastEighths < demand.breastEighths)
          shortages.push({
            kind: 'breast',
            productId: null,
            available: state.breastEighths,
            required: demand.breastEighths,
          });
        if (state.legEighths < demand.legEighths)
          shortages.push({
            kind: 'leg',
            productId: null,
            available: state.legEighths,
            required: demand.legEighths,
          });
      }
      const requiredDrinks = new Map(
        demand.drinks.map((drink) => [drink.productId, drink.quantity]),
      );
      for (const drink of drinks) {
        const required = requiredDrinks.get(drink.productId)!;
        if (drink.quantity < required)
          shortages.push({
            kind: 'drink',
            productId: drink.productId,
            available: drink.quantity,
            required,
          });
      }
      if (shortages.length > 0)
        throw new AppError({
          code: 'INSUFFICIENT_STOCK',
          message: 'No hay stock suficiente para enviar el pedido.',
          httpStatus: 409,
          details: { shortages },
        });

      const movement = async (
        kind: InventoryKind,
        productId: number | null,
        productName: string | null,
        quantity: number,
        quantityAfter: number,
      ) => {
        await models.InventoryMovement.create(
          {
            kind,
            productId,
            productName,
            type: 'consumption',
            delta: -quantity,
            quantityAfter,
            enabledAfter: null,
            reason: 'Envío a cocina',
            actorUserId: user.id,
            actorDisplayName: user.displayName,
            ticketId,
            createdAt: now(),
          },
          { transaction },
        );
      };
      if (state.chickenEnabled) {
        for (const kind of ['breast', 'leg'] as const) {
          const field = kind === 'breast' ? 'breastEighths' : 'legEighths';
          const required = demand[field];
          if (required === 0) continue;
          const quantityAfter = nextQuantity(state[field], -required);
          await state.update({ [field]: quantityAfter }, { transaction });
          await movement(kind, null, null, required, quantityAfter);
        }
      }
      for (const drink of drinks) {
        const required = requiredDrinks.get(drink.productId)!;
        if (required === 0) continue;
        const product = productById.get(drink.productId);
        if (product === undefined) throw createProductNotFoundError();
        const quantityAfter = nextQuantity(drink.quantity, -required);
        await drink.update({ quantity: quantityAfter }, { transaction });
        await movement('drink', drink.productId, product.name, required, quantityAfter);
      }
    },
    getInventory: (actor) => read(actor, ['admin']),
    getAvailability: (actor) => read(actor, ['waiter', 'admin']),
    async listMovements(afterId, actor) {
      inventoryQuerySchema.parse({ afterId });
      return sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
        async (transaction) => {
          await authorized(actor, ['admin'], transaction);
          const rows = await models.InventoryMovement.findAll({
            where: afterId === undefined ? {} : { id: { [Op.gt]: afterId } },
            order: [['id', 'ASC']],
            limit: 51,
            transaction,
          });
          const page = rows.slice(0, 50);
          return {
            movements: page.map(movementView),
            nextAfterId: rows.length > 50 ? page[49]!.id : null,
          };
        },
      );
    },
    setChickenControl(body, key, actor) {
      const request = inventoryControlRequestSchema.parse(body);
      return mutate(
        'PUT /inventory/chicken/control',
        request,
        request.reason,
        key,
        actor,
        (['breast', 'leg'] as const).map((kind) => ({
          kind,
          productId: null,
          type: 'control',
          delta: 0,
          enabled: request.enabled,
        })),
        200,
      );
    },
    setDrinkControl(productId, body, key, actor) {
      inventoryQuerySchema.parse({ afterId: productId });
      const request = inventoryControlRequestSchema.parse(body);
      return mutate(
        `PUT /inventory/drinks/${productId}/control`,
        request,
        request.reason,
        key,
        actor,
        [{ kind: 'drink', productId, type: 'control', delta: 0, enabled: request.enabled }],
        200,
      );
    },
    addChickenBatch(body, key, actor) {
      const request = inventoryBatchRequestSchema.parse(body);
      const delta = chickenBatchEighths(request.chickens);
      return mutate(
        'POST /inventory/chicken/batches',
        request,
        request.reason,
        key,
        actor,
        [
          { kind: 'breast', productId: null, type: 'batch', delta: delta.breastEighths },
          { kind: 'leg', productId: null, type: 'batch', delta: delta.legEighths },
        ],
        201,
      );
    },
    addDrinkReceipt(productId, body, key, actor) {
      inventoryQuerySchema.parse({ afterId: productId });
      const request = inventoryReceiptRequestSchema.parse(body);
      return mutate(
        `POST /inventory/drinks/${productId}/receipts`,
        request,
        request.reason,
        key,
        actor,
        [{ kind: 'drink', productId, type: 'receipt', delta: request.quantity }],
        201,
      );
    },
    adjust(body, key, actor) {
      const request = inventoryAdjustmentRequestSchema.parse(body);
      return mutate(
        'POST /inventory/adjustments',
        request,
        request.reason,
        key,
        actor,
        [
          {
            kind: request.kind,
            productId: request.productId,
            type: 'adjustment',
            delta: request.delta,
          },
        ],
        201,
      );
    },
  };
}
