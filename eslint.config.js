import infra from '@ojson/infra/eslint';

export default [
  ...infra,
  {
    files: [
      'src/**/__tests__/**/*.{ts,d.ts}',
      'src/__tests__/**/*.{ts,d.ts}',
    ],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
  },
];

