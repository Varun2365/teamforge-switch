import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      // Safety: tests ALWAYS use a dedicated database, never teamforge-ops.
      MONGODB_URI: 'mongodb://127.0.0.1:27017/teamforge-test-ops',
    },
  },
});
