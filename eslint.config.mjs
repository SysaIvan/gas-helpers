import gts from 'gts';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: [
			'**/node_modules/*',
			'build/*',
			'dist/*',
			'testing',
			'template/**/*',
			'template-ui/**/*',
		],
	},
	...gts,
	{
		plugins: { '@typescript-eslint': tseslint.plugin },
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: 'onOpen',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
];
