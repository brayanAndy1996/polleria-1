import { DataTypes } from 'sequelize';
import type { Model, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { Cut, Portion, ProductCategory, UserRole } from '@polleria/shared';

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
export interface Models {
  User: ModelStatic<UserModel>;
  Session: ModelStatic<SessionModel>;
  Product: ModelStatic<ProductModel>;
  ProductPortion: ModelStatic<ProductPortionModel>;
  ComboItem: ModelStatic<ComboItemModel>;
}

export function defineModels(sequelize: Sequelize): Models {
  if (
    sequelize.isDefined('User') &&
    sequelize.isDefined('Session') &&
    sequelize.isDefined('Product') &&
    sequelize.isDefined('ProductPortion') &&
    sequelize.isDefined('ComboItem')
  ) {
    return {
      User: sequelize.model('User') as ModelStatic<UserModel>,
      Session: sequelize.model('Session') as ModelStatic<SessionModel>,
      Product: sequelize.model('Product') as ModelStatic<ProductModel>,
      ProductPortion: sequelize.model('ProductPortion') as ModelStatic<ProductPortionModel>,
      ComboItem: sequelize.model('ComboItem') as ModelStatic<ComboItemModel>,
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
  const models: Models = { User, Session, Product, ProductPortion, ComboItem };
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

/** Registra todas las asociaciones entre modelos ya definidos. */
function initAssociations(models: Models): void {
  const { User, Session, Product, ProductPortion } = models;
  User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
  Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Product.hasMany(ProductPortion, { foreignKey: 'productId' });
  ProductPortion.belongsTo(Product, { foreignKey: 'productId' });
  initComboItemAssociations(models);
}
