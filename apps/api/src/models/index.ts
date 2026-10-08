import { DataTypes } from 'sequelize';
import type { Model, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { UserRole } from '@polleria/shared';

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
export interface Models {
  User: ModelStatic<UserModel>;
  Session: ModelStatic<SessionModel>;
}

export function defineModels(sequelize: Sequelize): Models {
  if (sequelize.isDefined('User') && sequelize.isDefined('Session')) {
    return {
      User: sequelize.model('User') as ModelStatic<UserModel>,
      Session: sequelize.model('Session') as ModelStatic<SessionModel>,
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
  User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
  Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  return { User, Session };
}
