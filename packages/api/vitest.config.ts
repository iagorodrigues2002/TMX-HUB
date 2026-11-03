import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Legacy task/call fixtures truncate shared tables in the disposable database.
    fileParallelism: !process.env.TASK_TEST_DATABASE_URL,
  },
});
