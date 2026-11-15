import { defineConfig } from 'vitest/config';
import { loadConfig } from './scripts/load-config.mjs';

// Tests always use the committed defaults, so a developer's .env can't change results.
export default defineConfig({
  define: {
    __GP_CONFIG__: JSON.stringify(loadConfig({ useEnv: false }).config),
  },
});
