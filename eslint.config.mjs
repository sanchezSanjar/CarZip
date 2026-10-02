// ESLint 9 flat config (replaces .eslintrc.js). Same rules as before: typescript-eslint recommended + Prettier.
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['dist/**', 'node_modules/**', 'uploads/**', 'eslint.config.mjs'] },
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	eslintPluginPrettierRecommended, // runs Prettier as a lint rule, and turns off rules that fight with it
	{
		languageOptions: {
			globals: { ...globals.node, ...globals.jest },
			sourceType: 'module',
		},
		rules: {
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
);
