import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next/', 'out/', 'node_modules/', 'coverage/', 'playwright-report/', 'test-results/', 'next-env.d.ts'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', 'next', 'next/*', 'zod', '@/adapters/*', '@/application/*', '@/components/*', '@/ports/*', '@data/*'],
          message: 'src/domain must stay pure.',
        }],
      }],
      'no-restricted-globals': ['error',
        { name: 'window', message: 'src/domain must stay pure.' },
        { name: 'document', message: 'src/domain must stay pure.' },
        { name: 'localStorage', message: 'src/domain must stay pure.' },
      ],
      'no-restricted-properties': ['error', { object: 'Date', property: 'now', message: 'Pass time in as an argument.' }],
    },
  },
  {
    files: ['src/components/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/domain/allocation', '@/domain/readiness', '@/domain/alternatives', '@data/*'],
          message: 'The UI renders view models. It must not calculate readiness or read fixtures.',
        }],
      }],
    },
  },
);
