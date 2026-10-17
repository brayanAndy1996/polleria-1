import { col, fn, where } from 'sequelize';
import type { Model, ModelStatic, QueryInterface, Transaction } from 'sequelize';
import {
  comboItemInputSchema,
  displayNameSchema,
  productCategorySchema,
  productNameSchema,
  priceCentsSchema,
  pinSchema,
  productPortionInputSchema,
  tableNameSchema,
  usernameSchema,
  userRolesSchema,
} from '@polleria/shared';
import { defineModels } from '../../models/index.ts';
import { createBcryptPinHasher } from '../../services/auth/pin-hasher.ts';

export interface SeedDemoOptions {
  environment: string | undefined;
}

const DEMO_USERS = [
  { username: 'demo.admin', displayName: 'Demo Administrador', pin: '135790', roles: ['admin'] },
  { username: 'demo.mozo', displayName: 'Demo Mozo', pin: '2468', roles: ['waiter'] },
  { username: 'demo.caja', displayName: 'Demo Cajero', pin: '1357', roles: ['cashier'] },
  { username: 'demo.cocina', displayName: 'Demo Cocina', pin: '8642', roles: ['kitchen'] },
] as const;

const DEMO_PRODUCTS = [
  { name: 'Demo Pollo', category: 'chicken', priceCents: 4000 },
  { name: 'Demo Chaufa', category: 'dish', priceCents: 1200 },
  { name: 'Demo Gaseosa', category: 'drink', priceCents: 500 },
  { name: 'Demo Ají', category: 'sauce', priceCents: 0 },
  { name: 'Demo Mayonesa', category: 'sauce', priceCents: 0 },
  { name: 'Demo Mostrito', category: 'combo', priceCents: 1800 },
] as const;

const DEMO_PORTIONS = [
  { portion: 'eighth', cut: 'breast', priceCents: 600 },
  { portion: 'eighth', cut: 'leg', priceCents: 600 },
  { portion: 'quarter', cut: 'breast', priceCents: 1200 },
  { portion: 'quarter', cut: 'leg', priceCents: 1200 },
  { portion: 'half', cut: null, priceCents: 2200 },
  { portion: 'whole', cut: null, priceCents: 4000 },
] as const;

function assertDevelopment(environment: string | undefined): void {
  if (environment !== 'development') {
    throw new Error('El seed de demo solo se permite con NODE_ENV=development.');
  }
}

function findByLowerName<T extends Model>(
  model: ModelStatic<T>,
  name: string,
  transaction: Transaction,
): Promise<T | null> {
  return model.findOne({
    where: where(fn('lower', col('name')), name.toLocaleLowerCase('es')),
    transaction,
  });
}

/** Inserta los datos faltantes de demo como una sola unidad reintentable. */
export async function seedDemo(
  queryInterface: QueryInterface,
  { environment }: SeedDemoOptions,
): Promise<void> {
  assertDevelopment(environment);

  const sequelize = queryInterface.sequelize;
  const models = defineModels(sequelize);
  const pinHasher = createBcryptPinHasher();

  // Valida constantes con los mismos esquemas que usan los endpoints antes de escribir.
  const users = DEMO_USERS.map((user) => ({
    username: usernameSchema.parse(user.username),
    displayName: displayNameSchema.parse(user.displayName),
    pin: pinSchema.parse(user.pin),
    roles: userRolesSchema.parse([...user.roles]),
  }));
  const products = DEMO_PRODUCTS.map((product) => ({
    name: productNameSchema.parse(product.name),
    category: productCategorySchema.parse(product.category),
    priceCents: priceCentsSchema.parse(product.priceCents),
  }));
  const portions = DEMO_PORTIONS.map((portion) => productPortionInputSchema.parse(portion));
  const tableNames = Array.from({ length: 6 }, (_, index) =>
    tableNameSchema.parse(`Demo ${index + 1}`),
  );

  await sequelize.transaction(async (transaction) => {
    for (const user of users) {
      const existing = await models.User.findOne({
        where: where(fn('lower', col('username')), user.username.toLowerCase()),
        transaction,
      });
      if (existing) continue;
      await models.User.create(
        {
          username: user.username,
          displayName: user.displayName,
          pinHash: await pinHasher.hash(user.pin),
          roles: user.roles,
        },
        { transaction },
      );
    }

    for (const name of tableNames) {
      const existing = await findByLowerName(models.Table, name, transaction);
      if (!existing) await models.Table.create({ name }, { transaction });
    }

    const productIds = new Map<string, number>();
    const createdProducts = new Set<string>();
    for (const product of products.filter(({ name }) => name !== 'Demo Mostrito')) {
      const existing = await findByLowerName(models.Product, product.name, transaction);
      const row = existing ?? (await models.Product.create(product, { transaction }));
      productIds.set(product.name, row.id);
      if (!existing) createdProducts.add(product.name);
    }

    const chickenId = productIds.get('Demo Pollo')!;
    if (createdProducts.has('Demo Pollo')) {
      for (const portion of portions) {
        await models.ProductPortion.create({ productId: chickenId, ...portion }, { transaction });
      }
    }

    const chicken = await models.Product.findByPk(chickenId, { transaction });
    const chaufaId = productIds.get('Demo Chaufa')!;
    const chaufa = await models.Product.findByPk(chaufaId, { transaction });
    const quarterLeg = await models.ProductPortion.findOne({
      where: { productId: chickenId, portion: 'quarter', cut: 'leg' },
      transaction,
    });
    const comboDependenciesAreValid =
      chicken?.category === 'chicken' &&
      chicken.isActive &&
      chaufa?.category === 'dish' &&
      chaufa.isActive &&
      quarterLeg !== null;

    // A collision can be a disabled or differently configured product. Keep it intact and
    // skip a new combo when its required components would violate the domain rules.
    if (comboDependenciesAreValid) {
      const combo = await findByLowerName(models.Product, 'Demo Mostrito', transaction);
      if (!combo) {
        const comboDefinition = products.find(({ name }) => name === 'Demo Mostrito')!;
        const createdCombo = await models.Product.create(comboDefinition, { transaction });
        const items = [
          comboItemInputSchema.parse({
            productId: chickenId,
            quantity: 1,
            portion: 'quarter',
            cut: 'leg',
          }),
          comboItemInputSchema.parse({ productId: chaufaId, quantity: 1 }),
        ];
        for (const item of items) {
          await models.ComboItem.create({ comboId: createdCombo.id, ...item }, { transaction });
        }
      }
    }
  });
}

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await seedDemo(context, { environment: process.env.NODE_ENV });
}

/** Seed data represents user-created content and is intentionally not destructively undone. */
export function down(): Promise<void> {
  return Promise.reject(
    new Error('El seed de demo no se revierte para proteger los datos existentes.'),
  );
}
