import { fileURLToPath } from 'url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests (npm test): business rules checked with fake models, so no database, network or SMS is needed.
 * SWC compiles the TypeScript with NestJS decorators the same way the app does.
 */
export default defineConfig({
	plugins: [swc.vite({ module: { type: 'es6' } })],
	resolve: {
		alias: { '@app/common': fileURLToPath(new URL('./libs/common/src', import.meta.url)) },
	},
	test: {
		include: ['apps/**/*.spec.ts', 'libs/**/*.spec.ts'],
		environment: 'node',
	},
});
