import { DataTypes } from 'sequelize';
import type { Model, Optional, Sequelize } from 'sequelize';
import type { PaymentMethod, PaymentSnapshot } from '@polleria/shared';

export interface PaymentAttributes {
  id: number;
  orderId: number;
  method: PaymentMethod;
  amountCents: number;
  receivedCents: number;
  changeCents: number;
  cashierUserId: number;
  paidAt: Date;
  billToken: string;
  snapshotVersion: number;
  snapshot: PaymentSnapshot;
}
export type PaymentModel = Model<PaymentAttributes, Optional<PaymentAttributes, 'id'>> &
  PaymentAttributes;

export function definePaymentModel(sequelize: Sequelize) {
  return sequelize.define<PaymentModel>(
    'Payment',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      method: { type: DataTypes.STRING(8), allowNull: false },
      amountCents: { type: DataTypes.INTEGER, allowNull: false },
      receivedCents: { type: DataTypes.INTEGER, allowNull: false },
      changeCents: { type: DataTypes.INTEGER, allowNull: false },
      cashierUserId: { type: DataTypes.INTEGER, allowNull: false },
      paidAt: { type: DataTypes.DATE, allowNull: false },
      billToken: { type: DataTypes.CHAR(64), allowNull: false },
      snapshotVersion: { type: DataTypes.SMALLINT, allowNull: false },
      snapshot: { type: DataTypes.JSONB, allowNull: false },
    },
    { tableName: 'payments', underscored: true, timestamps: false },
  );
}
