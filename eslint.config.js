import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/.next/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    '**/tmp/',
    '**/dist/',
    '**/build/',
    '**/next-env.d.ts',
    'docs/',
    '.claude/',
  ]),

  js.configs.recommended,

  // TypeScript con reglas que usan información de tipos (projectService busca el
  // tsconfig.json más cercano a cada archivo).
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Web: reglas de hooks y sin fuentes de Google (RNF-05: el sistema funciona sin internet).
  {
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/font/google',
              message:
                'No uses next/font/google: descarga fuentes de internet. Usa las fuentes del sistema.',
            },
          ],
        },
      ],
    },
  },

  // API: sequelize.sync() prohibido fuera de las pruebas (CLAUDE.md, regla 6).
  // Todo cambio de esquema es una migración.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='sync']",
          message:
            'No uses sequelize.sync() fuera de las pruebas. Todo cambio de esquema es una migración.',
        },
      ],
    },
  },
]);
