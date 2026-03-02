/** @type {import('prettier').Config} */
export default {
	plugins: ['@trivago/prettier-plugin-sort-imports'],
	importOrder: [
		'<BUILTIN_MODULES>',
		'<THIRD_PARTY_MODULES>',
		'^\\.\\./',
		'^\\./',
	],
	importOrderSeparation: true,
	importOrderSortSpecifiers: true,
	arrowParens: 'always',
	bracketSpacing: true,
	bracketSameLine: false,
	printWidth: 80,
	semi: true,
	singleQuote: true,
	trailingComma: 'es5',
	tabWidth: 4,
	useTabs: true,
};
