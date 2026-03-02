import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	build: {
		lib: {
			entry: {
				triggers: resolve(__dirname, 'src/triggers/index.ts'),
				telegram: resolve(__dirname, 'src/telegram/index.ts'),
				sheet: resolve(__dirname, 'src/sheet/index.ts'),
				ui: resolve(__dirname, 'src/ui/index.ts'),
				properties: resolve(__dirname, 'src/properties/index.ts'),
			},
			formats: ['es'],
		},
		rollupOptions: {
			external: [],
		},
		sourcemap: false,
	},
	plugins: [
		dts({
			tsconfigPath: 'tsconfig.build.json',
		}),
	],
	test: {
		globals: true,
		include: ['**/__specs__/**/*.spec.ts'],
		coverage: {
			provider: 'istanbul',
			include: ['src/**/*.ts'],
			exclude: ['**/__specs__/**', '**/*.spec.ts', '**/index.ts'],
			reporter: ['text', 'json-summary'],
		},
	},
});
