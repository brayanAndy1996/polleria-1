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
export interface Models {
  User: ModelStatic<UserModel>;
  Session: ModelStatic<SessionModel>;
  Product: ModelStatic<ProductModel>;
  ProductPortion: ModelStatic<ProductPortionModel>;
}

export function defineModels(sequelize: Sequelize): Models {
  if (
    sequelize.isDefined('User') &&
    sequelize.isDefined('Session') &&
    sequelize.isDefined('Product') &&
    sequelize.isDefined('ProductPortion')
  ) {
    return {
      User: sequelize.model('User') as ModelStatic<UserModel>,
      Session: sequelize.model('Session') as ModelStatic<SessionModel>,
      Product: sequelize.model('Product') as ModelStatic<ProductModel>,
      ProductPortion: sequelize.model('ProductPortion') as ModelStatic<ProductPortionModel>,
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
  User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
  Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Product.hasMany(ProductPortion, { foreignKey: 'productId' });
  ProductPortion.belongsTo(Product, { foreignKey: 'productId' });
  return { User, Session, Product, ProductPortion };
}
