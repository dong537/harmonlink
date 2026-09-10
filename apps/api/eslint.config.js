const createConfig = require('@ipeasy/eslint-config');

module.exports = [
  ...createConfig({ tsconfigRootDir: __dirname }),
  {
    // The repository contains legacy TypeScript build artifacts beside src.
    // They are runtime output, not lint inputs, and project-service parsing of
    // them causes false errors (and makes `eslint src` scan indefinitely).
    ignores: ['src/**/*.js', 'src/**/*.d.ts', 'src/**/*.js.map'],
  },
];
