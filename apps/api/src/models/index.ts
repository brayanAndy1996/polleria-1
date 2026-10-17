import { DataTypes } from 'sequelize';
import { definePaymentModel } from './payment.ts';
import type { PaymentModel } from './payment.ts';
export type { PaymentModel } from './payment.ts';
import { defineKitchenTicketPrintModels } from './kitchen-ticket-print.ts';
import type {
  KitchenTicketPrintModel,
  KitchenTicketPrintAttemptModel,
} from './kitchen-ticket-print.ts';
export type {
  KitchenTicketPrintModel,
  KitchenTicketPrintAttemptModel,
} from './kitchen-ticket-print.ts';
import type { Model, ModelStatic, Optional, Sequelize } from 'sequelize';
import type {
  Cut,
  KitchenTicketKind,
  OrderItemStatus,
  OrderStatus,
  Portion,
  ProductCategory,
  UserRole,
} from '@polleria/shared';

export interface UserAttributes {
  id: number;
  username: string;
  displayName: string;
  pinHash: string;
  roles: UserRole[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface SessionAttributes {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}
export interface ProductAttributes {
  id: number;
  name: string;
  category: ProductCategory;
  priceCents: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface ProductPortionAttributes {
  id: number;
  productId: number;
  portion: Portion;
  cut: Cut | null;
  priceCents: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface ComboItemAttributes {
  id: number;
  comboId: number;
  productId: number;
  quantity: number;
  portion: Portion | null;
  cut: Cut | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface OrderAttributes {
  id: number;
  status: OrderStatus;
  openedByUserId: number;
  openedAt: Date;
  readyAt: Date | null;
  readyByUserId: number | null;
  billRequestedAt: Date | null;
  billRequestedByUserId: number | null;
  closedAt: Date | null;
  closedByUserId: number | null;
  cancelReason: string | null;
  mergedIntoOrderId: number | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface TableAttributes {
  id: number;
  name: string;
  isActive: boolean;
  currentOrderId: number | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface KitchenTicketAttributes {
  id: number;
  orderId: number;
  kind: KitchenTicketKind;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface OrderItemAttributes {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  productCategory: ProductCategory;
  quantity: number;
  priceCents: number;
  portion: Portion | null;
  cut: Cut | null;
  breastEighths: number;
  legEighths: number;
  notes: string | null;
  status: OrderItemStatus;
  kitchenTicketId: number;
  voidTicketId: number | null;
  voidRequestedAt: Date | null;
  voidRequestedByUserId: number | null;
  voidRequestReason: string | null;
  voidedAt: Date | null;
  voidedByUserId: number | null;
  voidReason: string | null;
  orderedAtTableId: number | null;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface OrderItemComponentAttributes {
  id: number;
  orderItemId: number;
  productId: number;
  productName: string;
  quantity: number;
  portion: Portion | null;
  cut: Cut | null;
  breastEighths: number;
  legEighths: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface OrderItemSauceAttributes {
  id: number;
  orderItemId: number;
  productId: number;
  productName: string;
  quantity: number;
  priceCents: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface IdempotencyKeyAttributes {
  id: number;
  scope: string;
  key: string;
  orderId: number;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
}
export type UserModel = Model<
  UserAttributes,
  Optional<UserAttributes, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>
> &
  UserAttributes;
export type SessionModel = Model<
  SessionAttributes,
  Optional<SessionAttributes, 'id' | 'createdAt'>
> &
  SessionAttributes;
export type ProductModel = Model<
  ProductAttributes,
  Optional<ProductAttributes, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>
> &
  ProductAttributes;
export type ProductPortionModel = Model<
  ProductPortionAttributes,
  Optional<ProductPortionAttributes, 'id' | 'cut' | 'createdAt' | 'updatedAt'>
> &
  ProductPortionAttributes;
export type ComboItemModel = Model<
  ComboItemAttributes,
  Optional<ComboItemAttributes, 'id' | 'createdAt' | 'updatedAt'>
> &
  ComboItemAttributes;
export type OrderModel = Model<
  OrderAttributes,
  Optional<
    OrderAttributes,
    | 'id'
    | 'status'
    | 'openedAt'
    | 'readyAt'
    | 'readyByUserId'
    | 'billRequestedAt'
    | 'billRequestedByUserId'
    | 'closedAt'
    | 'closedByUserId'
    | 'cancelReason'
    | 'mergedIntoOrderId'
    | 'createdAt'
    | 'updatedAt'
  >
> &
  OrderAttributes;
export type TableModel = Model<
  TableAttributes,
  Optional<TableAttributes, 'id' | 'isActive' | 'currentOrderId' | 'createdAt' | 'updatedAt'>
> &
  TableAttributes;
export type KitchenTicketModel = Model<
  KitchenTicketAttributes,
  Optional<KitchenTicketAttributes, 'id' | 'createdAt' | 'updatedAt'>
> &
  KitchenTicketAttributes;
export type OrderItemModel = Model<
  OrderItemAttributes,
  Optional<
    OrderItemAttributes,
    | 'id'
    | 'portion'
    | 'cut'
    | 'breastEighths'
    | 'legEighths'
    | 'notes'
    | 'status'
    | 'voidTicketId'
    | 'voidRequestedAt'
    | 'voidRequestedByUserId'
    | 'voidRequestReason'
    | 'voidedAt'
    | 'voidedByUserId'
    | 'voidReason'
    | 'orderedAtTableId'
    | 'createdAt'
    | 'updatedAt'
  >
> &
  OrderItemAttributes;
export type OrderItemComponentModel = Model<
  OrderItemComponentAttributes,
  Optional<
    OrderItemComponentAttributes,
    'id' | 'portion' | 'cut' | 'breastEighths' | 'legEighths' | 'createdAt' | 'updatedAt'
  >
> &
  OrderItemComponentAttributes;
export type OrderItemSauceModel = Model<
  OrderItemSauceAttributes,
  Optional<OrderItemSauceAttributes, 'id' | 'createdAt' | 'updatedAt'>
> &
  OrderItemSauceAttributes;
export type IdempotencyKeyModel = Model<
  IdempotencyKeyAttributes,
  Optional<IdempotencyKeyAttributes, 'id' | 'createdAt'>
> &
  IdempotencyKeyAttributes;
export interface Models {
  Payment: ModelStatic<PaymentModel>;
  KitchenTicketPrint: ModelStatic<KitchenTicketPrintModel>;
  KitchenTicketPrintAttempt: ModelStatic<KitchenTicketPrintAttemptModel>;
  User: ModelStatic<UserModel>;
  Session: ModelStatic<SessionModel>;
  Product: ModelStatic<ProductModel>;
  ProductPortion: ModelStatic<ProductPortionModel>;
  ComboItem: ModelStatic<ComboItemModel>;
  Order: ModelStatic<OrderModel>;
  Table: ModelStatic<TableModel>;
  KitchenTicket: ModelStatic<KitchenTicketModel>;
  OrderItem: ModelStatic<OrderItemModel>;
  OrderItemComponent: ModelStatic<OrderItemComponentModel>;
  OrderItemSauce: ModelStatic<OrderItemSauceModel>;
  IdempotencyKey: ModelStatic<IdempotencyKeyModel>;
}

export function defineModels(sequelize: Sequelize): Models {
  if (
    sequelize.isDefined('User') &&
    sequelize.isDefined('Session') &&
    sequelize.isDefined('Product') &&
    sequelize.isDefined('ProductPortion') &&
    sequelize.isDefined('ComboItem') &&
    sequelize.isDefined('Order') &&
    sequelize.isDefined('Table') &&
    sequelize.isDefined('KitchenTicket') &&
    sequelize.isDefined('OrderItem') &&
    sequelize.isDefined('OrderItemComponent') &&
    sequelize.isDefined('OrderItemSauce') &&
    sequelize.isDefined('IdempotencyKey') &&
    sequelize.isDefined('KitchenTicketPrint') &&
    sequelize.isDefined('KitchenTicketPrintAttempt') &&
    sequelize.isDefined('Payment')
  ) {
    return {
      Payment: sequelize.model('Payment') as ModelStatic<PaymentModel>,
      KitchenTicketPrint: sequelize.model(
        'KitchenTicketPrint',
      ) as ModelStatic<KitchenTicketPrintModel>,
      KitchenTicketPrintAttempt: sequelize.model(
        'KitchenTicketPrintAttempt',
      ) as ModelStatic<KitchenTicketPrintAttemptModel>,
      User: sequelize.model('User') as ModelStatic<UserModel>,
      Session: sequelize.model('Session') as ModelStatic<SessionModel>,
      Product: sequelize.model('Product') as ModelStatic<ProductModel>,
      ProductPortion: sequelize.model('ProductPortion') as ModelStatic<ProductPortionModel>,
      ComboItem: sequelize.model('ComboItem') as ModelStatic<ComboItemModel>,
      Order: sequelize.model('Order') as ModelStatic<OrderModel>,
      Table: sequelize.model('Table') as ModelStatic<TableModel>,
      KitchenTicket: sequelize.model('KitchenTicket') as ModelStatic<KitchenTicketModel>,
      OrderItem: sequelize.model('OrderItem') as ModelStatic<OrderItemModel>,
      OrderItemComponent: sequelize.model(
        'OrderItemComponent',
      ) as ModelStatic<OrderItemComponentModel>,
      OrderItemSauce: sequelize.model('OrderItemSauce') as ModelStatic<OrderItemSauceModel>,
      IdempotencyKey: sequelize.model('IdempotencyKey') as ModelStatic<IdempotencyKeyModel>,
    };
  }
  const User = sequelize.define<UserModel>(
    'User',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      displayName: { type: DataTypes.STRING(40), allowNull: false },
      pinHash: { type: DataTypes.STRING(60), allowNull: false },
      roles: { type: DataTypes.ARRAY(DataTypes.STRING(16)), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'users', underscored: true },
  );
  const Session = sequelize.define<SessionModel>(
    'Session',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'sessions', underscored: true, updatedAt: false },
  );
  // Spec 005: la carta. La unicidad del nombre vive en el índice por expresión
  // products_name_unique (lower(name)) de la migración, no como UNIQUE de la columna.
  const Product = sequelize.define<ProductModel>(
    'Product',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(60), allowNull: false },
      category: { type: DataTypes.STRING(16), allowNull: false },
      priceCents: { type: DataTypes.INTEGER, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'products', underscored: true },
  );
  // Spec 006: presentaciones del pollo. La unicidad (product_id, portion, cut) con
  // NULLS NOT DISTINCT, los CHECK de correspondencia parte-presentación y el índice
  // por product_id viven en la migración, no en el modelo.
  const ProductPortion = sequelize.define<ProductPortionModel>(
    'ProductPortion',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      productId: { type: DataTypes.INTEGER, allowNull: false },
      portion: { type: DataTypes.STRING(8), allowNull: false },
      // La única columna que admite NULL: half y whole llevan ambas partes (RN-006-04).
      cut: { type: DataTypes.STRING(8), allowNull: true },
      priceCents: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'product_portions', underscored: true },
  );
  // Spec 007: componentes del combo. La unicidad (combo_id, product_id, portion, cut)
  // con NULLS NOT DISTINCT, los CHECK de forma de la fila y los índices por combo_id y
  // product_id viven en la migración, no en el modelo. portion y cut admiten NULL:
  // un componente que no es pollo no lleva ninguna (RN-007-05).
  const ComboItem = sequelize.define<ComboItemModel>(
    'ComboItem',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      comboId: { type: DataTypes.INTEGER, allowNull: false },
      productId: { type: DataTypes.INTEGER, allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      portion: { type: DataTypes.STRING(8), allowNull: true },
      cut: { type: DataTypes.STRING(8), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'combo_items', underscored: true },
  );
  // Spec 009: la cuenta abierta. El ciclo open/closed/cancelled/merged, los pares
  // fecha+autor de las señales y las restricciones de consistencia del cierre y del
  // merge viven en los CHECK de la migración, no en el modelo.
  const Order = sequelize.define<OrderModel>(
    'Order',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'open' },
      openedByUserId: { type: DataTypes.INTEGER, allowNull: false },
      openedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      readyAt: { type: DataTypes.DATE, allowNull: true },
      readyByUserId: { type: DataTypes.INTEGER, allowNull: true },
      billRequestedAt: { type: DataTypes.DATE, allowNull: true },
      billRequestedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      closedAt: { type: DataTypes.DATE, allowNull: true },
      closedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      cancelReason: { type: DataTypes.STRING(200), allowNull: true },
      mergedIntoOrderId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'orders', underscored: true },
  );
  // Spec 009: la mesa del salón. La unicidad por lower(name), el CHECK del nombre y
  // el índice parcial sobre current_order_id viven en la migración.
  const Table = sequelize.define<TableModel>(
    'Table',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(40), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      currentOrderId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'tables', underscored: true },
  );
  // Spec 010: comandas, ítems del pedido con sus hijas y claves de idempotencia.
  // Los CHECK de forma de fila, la consistencia de la anulación y la unicidad
  // (scope, key) viven en la migración, no en el modelo.
  const KitchenTicket = sequelize.define<KitchenTicketModel>(
    'KitchenTicket',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: DataTypes.INTEGER, allowNull: false },
      kind: { type: DataTypes.STRING(12), allowNull: false },
      createdByUserId: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'kitchen_tickets', underscored: true },
  );
  const OrderItem = sequelize.define<OrderItemModel>(
    'OrderItem',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: DataTypes.INTEGER, allowNull: false },
      productId: { type: DataTypes.INTEGER, allowNull: false },
      productName: { type: DataTypes.STRING(60), allowNull: false },
      productCategory: { type: DataTypes.STRING(16), allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      priceCents: { type: DataTypes.INTEGER, allowNull: false },
      portion: { type: DataTypes.STRING(8), allowNull: true },
      cut: { type: DataTypes.STRING(8), allowNull: true },
      breastEighths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      legEighths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      notes: { type: DataTypes.STRING(200), allowNull: true },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'sent' },
      kitchenTicketId: { type: DataTypes.INTEGER, allowNull: false },
      voidTicketId: { type: DataTypes.INTEGER, allowNull: true },
      voidRequestedAt: { type: DataTypes.DATE, allowNull: true },
      voidRequestedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      voidRequestReason: { type: DataTypes.STRING(200), allowNull: true },
      voidedAt: { type: DataTypes.DATE, allowNull: true },
      voidedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      voidReason: { type: DataTypes.STRING(200), allowNull: true },
      orderedAtTableId: { type: DataTypes.INTEGER, allowNull: true },
      createdByUserId: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'order_items', underscored: true },
  );
  const OrderItemComponent = sequelize.define<OrderItemComponentModel>(
    'OrderItemComponent',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      orderItemId: { type: DataTypes.INTEGER, allowNull: false },
      productId: { type: DataTypes.INTEGER, allowNull: false },
      productName: { type: DataTypes.STRING(60), allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      portion: { type: DataTypes.STRING(8), allowNull: true },
      cut: { type: DataTypes.STRING(8), allowNull: true },
      breastEighths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      legEighths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'order_item_components', underscored: true },
  );
  const OrderItemSauce = sequelize.define<OrderItemSauceModel>(
    'OrderItemSauce',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      orderItemId: { type: DataTypes.INTEGER, allowNull: false },
      productId: { type: DataTypes.INTEGER, allowNull: false },
      productName: { type: DataTypes.STRING(60), allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      priceCents: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'order_item_sauces', underscored: true },
  );
  const IdempotencyKey = sequelize.define<IdempotencyKeyModel>(
    'IdempotencyKey',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      scope: { type: DataTypes.STRING(32), allowNull: false },
      key: { type: DataTypes.STRING(128), allowNull: false },
      orderId: { type: DataTypes.INTEGER, allowNull: false },
      requestHash: { type: DataTypes.STRING(64), allowNull: false },
      responseStatus: { type: DataTypes.SMALLINT, allowNull: false },
      responseBody: { type: DataTypes.JSONB, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'idempotency_keys', underscored: true, updatedAt: false },
  );
  const models: Models = {
    Payment: definePaymentModel(sequelize),
    ...defineKitchenTicketPrintModels(sequelize),
    User,
    Session,
    Product,
    ProductPortion,
    ComboItem,
    Order,
    Table,
    KitchenTicket,
    OrderItem,
    OrderItemComponent,
    OrderItemSauce,
    IdempotencyKey,
  };
  initAssociations(models);
  return models;
}

/**
 * Asociaciones de la spec 007 (sección 8.2): el combo tiene muchos componentes y cada
 * fila de combo_items referencia dos veces a products — como combo (combo_id, el
 * producto 'combo' dueño de la fila) y como componente (product_id). El alias 'product'
 * es el que usa el servicio para embeber el componente en el GET y el PUT.
 */
export function initComboItemAssociations(models: Pick<Models, 'Product' | 'ComboItem'>): void {
  const { Product, ComboItem } = models;
  Product.hasMany(ComboItem, { foreignKey: 'comboId', as: 'comboItems' });
  ComboItem.belongsTo(Product, { foreignKey: 'comboId', as: 'combo' });
  ComboItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
}

/**
 * Asociaciones de la spec 009 (sección 8.2): el pedido referencia a users tres
 * veces más allá del que lo abrió —quien marcó listo, quien pidió la cuenta y
 * quien cerró— y a sí mismo como destino del merge; cada mesa apunta al pedido
 * que la cubre con current_order_id y un pedido cubre muchas mesas.
 */
export function initOrderTableAssociations(models: Pick<Models, 'User' | 'Order' | 'Table'>): void {
  const { User, Order, Table } = models;
  Order.belongsTo(User, { foreignKey: 'openedByUserId', as: 'openedBy' });
  Order.belongsTo(User, { foreignKey: 'readyByUserId', as: 'readyBy' });
  Order.belongsTo(User, { foreignKey: 'billRequestedByUserId', as: 'billRequestedBy' });
  Order.belongsTo(User, { foreignKey: 'closedByUserId', as: 'closedBy' });
  Order.belongsTo(Order, { foreignKey: 'mergedIntoOrderId', as: 'mergedIntoOrder' });
  Order.hasMany(Table, { foreignKey: 'currentOrderId', as: 'tables' });
  Table.belongsTo(Order, { foreignKey: 'currentOrderId', as: 'currentOrder' });
}

/**
 * Asociaciones de la spec 010 (sección 8.6): la comanda pertenece al pedido y la
 * firma un usuario; el ítem pertenece al pedido, al producto original, a la
 * comanda que lo creó y —si está anulado— a la comanda 'void'; conserva la mesa
 * donde se envió y referencia a quienes lo enviaron, pidieron anular y anularon;
 * componentes y cremas cuelgan del ítem; la clave de idempotencia pertenece al
 * pedido.
 */
export function initOrderItemAssociations(
  models: Pick<
    Models,
    | 'User'
    | 'Order'
    | 'Table'
    | 'Product'
    | 'KitchenTicket'
    | 'OrderItem'
    | 'OrderItemComponent'
    | 'OrderItemSauce'
    | 'IdempotencyKey'
  >,
): void {
  const {
    User,
    Order,
    Table,
    Product,
    KitchenTicket,
    OrderItem,
    OrderItemComponent,
    OrderItemSauce,
    IdempotencyKey,
  } = models;
  Order.hasMany(KitchenTicket, { foreignKey: 'orderId', as: 'kitchenTickets' });
  KitchenTicket.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  KitchenTicket.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });
  KitchenTicket.hasMany(OrderItem, { foreignKey: 'kitchenTicketId', as: 'items' });
  Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
  OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  OrderItem.belongsTo(KitchenTicket, { foreignKey: 'kitchenTicketId', as: 'kitchenTicket' });
  OrderItem.belongsTo(KitchenTicket, { foreignKey: 'voidTicketId', as: 'voidTicket' });
  OrderItem.belongsTo(Table, { foreignKey: 'orderedAtTableId', as: 'orderedAtTable' });
  OrderItem.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });
  OrderItem.belongsTo(User, { foreignKey: 'voidRequestedByUserId', as: 'voidRequestedBy' });
  OrderItem.belongsTo(User, { foreignKey: 'voidedByUserId', as: 'voidedBy' });
  OrderItem.hasMany(OrderItemComponent, { foreignKey: 'orderItemId', as: 'components' });
  OrderItemComponent.belongsTo(OrderItem, { foreignKey: 'orderItemId', as: 'orderItem' });
  OrderItemComponent.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  OrderItem.hasMany(OrderItemSauce, { foreignKey: 'orderItemId', as: 'sauces' });
  OrderItemSauce.belongsTo(OrderItem, { foreignKey: 'orderItemId', as: 'orderItem' });
  OrderItemSauce.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  IdempotencyKey.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
}

/** Registra todas las asociaciones entre modelos ya definidos. */
function initAssociations(models: Models): void {
  const { User, Session, Product, ProductPortion } = models;
  models.Payment.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
  models.Payment.belongsTo(User, { foreignKey: 'cashierUserId', as: 'cashier' });
  models.Order.hasOne(models.Payment, { foreignKey: 'orderId', as: 'payment' });
  models.KitchenTicket.hasOne(models.KitchenTicketPrint, {
    foreignKey: 'ticketId',
    as: 'printSnapshot',
  });
  models.KitchenTicketPrint.belongsTo(models.KitchenTicket, {
    foreignKey: 'ticketId',
    as: 'ticket',
  });
  models.KitchenTicketPrint.hasMany(models.KitchenTicketPrintAttempt, {
    foreignKey: 'ticketId',
    as: 'attempts',
  });
  models.KitchenTicketPrintAttempt.belongsTo(models.KitchenTicketPrint, {
    foreignKey: 'ticketId',
    as: 'printSnapshot',
  });
  models.KitchenTicketPrintAttempt.belongsTo(User, {
    foreignKey: 'requestedByUserId',
    as: 'requestedBy',
  });
  User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
  Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Product.hasMany(ProductPortion, { foreignKey: 'productId' });
  ProductPortion.belongsTo(Product, { foreignKey: 'productId' });
  initComboItemAssociations(models);
  initOrderTableAssociations(models);
  initOrderItemAssociations(models);
}
