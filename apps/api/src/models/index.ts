import { DataTypes } from 'sequelize';
import type { Model, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { Cut, OrderStatus, Portion, ProductCategory, UserRole } from '@polleria/shared';

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
export interface Models {
  User: ModelStatic<UserModel>;
  Session: ModelStatic<SessionModel>;
  Product: ModelStatic<ProductModel>;
  ProductPortion: ModelStatic<ProductPortionModel>;
  ComboItem: ModelStatic<ComboItemModel>;
  Order: ModelStatic<OrderModel>;
  Table: ModelStatic<TableModel>;
}

export function defineModels(sequelize: Sequelize): Models {
  if (
    sequelize.isDefined('User') &&
    sequelize.isDefined('Session') &&
    sequelize.isDefined('Product') &&
    sequelize.isDefined('ProductPortion') &&
    sequelize.isDefined('ComboItem') &&
    sequelize.isDefined('Order') &&
    sequelize.isDefined('Table')
  ) {
    return {
      User: sequelize.model('User') as ModelStatic<UserModel>,
      Session: sequelize.model('Session') as ModelStatic<SessionModel>,
      Product: sequelize.model('Product') as ModelStatic<ProductModel>,
      ProductPortion: sequelize.model('ProductPortion') as ModelStatic<ProductPortionModel>,
      ComboItem: sequelize.model('ComboItem') as ModelStatic<ComboItemModel>,
      Order: sequelize.model('Order') as ModelStatic<OrderModel>,
      Table: sequelize.model('Table') as ModelStatic<TableModel>,
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
  const models: Models = { User, Session, Product, ProductPortion, ComboItem, Order, Table };
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
export function initOrderTableAssociations(
  models: Pick<Models, 'User' | 'Order' | 'Table'>,
): void {
  const { User, Order, Table } = models;
  Order.belongsTo(User, { foreignKey: 'openedByUserId', as: 'openedBy' });
  Order.belongsTo(User, { foreignKey: 'readyByUserId', as: 'readyBy' });
  Order.belongsTo(User, { foreignKey: 'billRequestedByUserId', as: 'billRequestedBy' });
  Order.belongsTo(User, { foreignKey: 'closedByUserId', as: 'closedBy' });
  Order.belongsTo(Order, { foreignKey: 'mergedIntoOrderId', as: 'mergedIntoOrder' });
  Order.hasMany(Table, { foreignKey: 'currentOrderId', as: 'tables' });
  Table.belongsTo(Order, { foreignKey: 'currentOrderId', as: 'currentOrder' });
}

/** Registra todas las asociaciones entre modelos ya definidos. */
function initAssociations(models: Models): void {
  const { User, Session, Product, ProductPortion } = models;
  User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
  Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Product.hasMany(ProductPortion, { foreignKey: 'productId' });
  ProductPortion.belongsTo(Product, { foreignKey: 'productId' });
  initComboItemAssociations(models);
  initOrderTableAssociations(models);
}
