import tsparser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
	...obsidianmd.configs.recommended,

	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: './tsconfig.json',
			},
			globals: {
				console: 'readonly',
				document: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
			},
		},
	},

	{
		ignores: ['dist/**', 'node_modules/**', 'tests/**'],
	},
]);
