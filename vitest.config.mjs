import infra from '@ojson/infra/vitest';

const explicitSpecFiles = process.argv.filter(
  (arg) => arg.endsWith('.spec.ts') && !arg.includes('*'),
);
const specCoverageEnabled = explicitSpecFiles.length === 0;

export default {
  ...infra,
  test: {
    ...(infra.test ?? {}),
    ...(specCoverageEnabled
      ? {
          globalSetup: '@ojson/spec-coverage/setup',
          reporters: ['default', '@ojson/spec-coverage/reporter'],
        }
      : {}),
    include: ['src/**/*.spec.ts', 'examples/**/*.spec.ts'],
  },
};
