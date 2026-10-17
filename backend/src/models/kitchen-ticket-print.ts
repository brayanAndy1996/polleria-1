import { DataTypes } from 'sequelize';
import type { Model, Optional, Sequelize } from 'sequelize';
import type {
  KitchenTicketPrintAttemptStatus,
  KitchenTicketPrintErrorCode,
} from '@polleria/shared';
import type { KitchenTicketPrintSnapshot } from '../services/kitchen-ticket-prints/print-snapshot.ts';
import type { PrintJob } from '../services/printer/print-job.ts';

export interface KitchenTicketPrintAttributes {
  ticketId: number;
  snapshotVersion: number;
  snapshot: KitchenTicketPrintSnapshot;
  createdAt: Date;
}
export interface KitchenTicketPrintAttemptAttributes {
  id: number;
  ticketId: number;
  copyNumber: number;
  status: KitchenTicketPrintAttemptStatus;
  requestedByUserId: number;
  requestedByName: string;
  reason: string | null;
  idempotencyKey: string | null;
  requestHash: string | null;
  responseBody: unknown;
  documents: PrintJob[] | null;
  outputDirectoryHash: string | null;
  ownerHost: string | null;
  ownerPid: number | null;
  ownerExecutionId: string | null;
  completedPages: number;
  errorCode: KitchenTicketPrintErrorCode | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}
export type KitchenTicketPrintModel = Model<
  KitchenTicketPrintAttributes,
  Optional<KitchenTicketPrintAttributes, 'createdAt'>
> &
  KitchenTicketPrintAttributes;
export type KitchenTicketPrintAttemptModel = Model<
  KitchenTicketPrintAttemptAttributes,
  Optional<
    KitchenTicketPrintAttemptAttributes,
    | 'id'
    | 'reason'
    | 'idempotencyKey'
    | 'requestHash'
    | 'responseBody'
    | 'documents'
    | 'outputDirectoryHash'
    | 'ownerHost'
    | 'ownerPid'
    | 'ownerExecutionId'
    | 'completedPages'
    | 'errorCode'
    | 'createdAt'
    | 'startedAt'
    | 'finishedAt'
  >
> &
  KitchenTicketPrintAttemptAttributes;

export function defineKitchenTicketPrintModels(sequelize: Sequelize) {
  const KitchenTicketPrint = sequelize.define<KitchenTicketPrintModel>(
    'KitchenTicketPrint',
    {
      ticketId: { type: DataTypes.INTEGER, primaryKey: true },
      snapshotVersion: { type: DataTypes.SMALLINT, allowNull: false },
      snapshot: { type: DataTypes.JSONB, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'kitchen_ticket_prints', underscored: true, updatedAt: false },
  );
  const KitchenTicketPrintAttempt = sequelize.define<KitchenTicketPrintAttemptModel>(
    'KitchenTicketPrintAttempt',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ticketId: { type: DataTypes.INTEGER, allowNull: false },
      copyNumber: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(16), allowNull: false },
      requestedByUserId: { type: DataTypes.INTEGER, allowNull: false },
      requestedByName: { type: DataTypes.STRING(40), allowNull: false },
      reason: { type: DataTypes.STRING(200), allowNull: true },
      idempotencyKey: { type: DataTypes.STRING(128), allowNull: true },
      requestHash: { type: DataTypes.STRING(64), allowNull: true },
      responseBody: { type: DataTypes.JSONB, allowNull: true },
      documents: { type: DataTypes.JSONB, allowNull: true },
      outputDirectoryHash: { type: DataTypes.STRING(64), allowNull: true },
      ownerHost: { type: DataTypes.STRING(255), allowNull: true },
      ownerPid: { type: DataTypes.INTEGER, allowNull: true },
      ownerExecutionId: { type: DataTypes.UUID, allowNull: true },
      completedPages: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      errorCode: { type: DataTypes.STRING(32), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      startedAt: { type: DataTypes.DATE, allowNull: true },
      finishedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'kitchen_ticket_print_attempts', underscored: true, updatedAt: false },
  );
  return { KitchenTicketPrint, KitchenTicketPrintAttempt };
}
