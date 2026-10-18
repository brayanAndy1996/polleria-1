import { DataTypes } from 'sequelize';
import type { Model, Optional, Sequelize } from 'sequelize';
import type { InventoryKind, InventoryMovement, InventoryMutationResponse } from '@polleria/shared';

export interface InventoryStateAttributes {
  id: number;
  chickenEnabled: boolean;
  breastEighths: number;
  legEighths: number;
}
export type InventoryStateModel = Model<
  InventoryStateAttributes,
  Optional<InventoryStateAttributes, 'chickenEnabled' | 'breastEighths' | 'legEighths'>
> &
  InventoryStateAttributes;
export interface InventoryDrinkAttributes {
  productId: number;
  productCategory: 'drink';
  enabled: boolean;
  quantity: number;
}
export type InventoryDrinkModel = Model<
  InventoryDrinkAttributes,
  Optional<InventoryDrinkAttributes, 'productCategory' | 'enabled' | 'quantity'>
> &
  InventoryDrinkAttributes;
export interface InventoryMovementAttributes {
  id: number;
  kind: InventoryKind;
  productId: number | null;
  productName: string | null;
  type: InventoryMovement['type'];
  delta: number;
  quantityAfter: number;
  enabledAfter: boolean | null;
  reason: string;
  actorUserId: number;
  actorDisplayName: string;
  ticketId: number | null;
  createdAt: Date;
}
export type InventoryMovementModel = Model<
  InventoryMovementAttributes,
  Optional<InventoryMovementAttributes, 'id'>
> &
  InventoryMovementAttributes;
export interface InventoryCommandAttributes {
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: InventoryMutationResponse | Record<string, never>;
  actorUserId: number;
  createdAt: Date;
}
export type InventoryCommandModel = Model<InventoryCommandAttributes> & InventoryCommandAttributes;

export function defineInventoryModels(sequelize: Sequelize) {
  const InventoryState = sequelize.define<InventoryStateModel>(
    'InventoryState',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      chickenEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      breastEighths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      legEighths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'inventory_state', underscored: true, timestamps: false },
  );
  const InventoryDrink = sequelize.define<InventoryDrinkModel>(
    'InventoryDrink',
    {
      productId: { type: DataTypes.INTEGER, primaryKey: true },
      productCategory: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'drink' },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'inventory_drinks', underscored: true, timestamps: false },
  );
  const InventoryMovement = sequelize.define<InventoryMovementModel>(
    'InventoryMovement',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      kind: { type: DataTypes.STRING(8), allowNull: false },
      productId: { type: DataTypes.INTEGER, allowNull: true },
      productName: { type: DataTypes.STRING(60), allowNull: true },
      type: { type: DataTypes.STRING(16), allowNull: false },
      delta: { type: DataTypes.INTEGER, allowNull: false },
      quantityAfter: { type: DataTypes.INTEGER, allowNull: false },
      enabledAfter: { type: DataTypes.BOOLEAN, allowNull: true },
      reason: { type: DataTypes.STRING(200), allowNull: false },
      actorUserId: { type: DataTypes.INTEGER, allowNull: false },
      actorDisplayName: { type: DataTypes.STRING(40), allowNull: false },
      ticketId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: 'inventory_movements', underscored: true, timestamps: false },
  );
  const InventoryCommand = sequelize.define<InventoryCommandModel>(
    'InventoryCommand',
    {
      key: { type: DataTypes.STRING(128), primaryKey: true },
      requestHash: { type: DataTypes.CHAR(64), allowNull: false },
      responseStatus: { type: DataTypes.INTEGER, allowNull: false },
      responseBody: { type: DataTypes.JSONB, allowNull: false },
      actorUserId: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: 'inventory_commands', underscored: true, timestamps: false },
  );
  return { InventoryState, InventoryDrink, InventoryMovement, InventoryCommand };
}
