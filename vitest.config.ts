import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        env: {
            NODE_ENV: 'test',
            DATABASE_URL: process.env.DATABASE_URL,
            API_KEY: 'test-api-key',
        },
        setupFiles: ['./tests/setup.ts'],
        pool: 'forks',
        globals: true,
    },
}); 