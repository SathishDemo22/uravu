// Lint rules for Uravu.  Run:  npm run lint
import fs from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';
import * as espree from 'espree';

// The app files in js/ are plain <script> tags that share one global scope, loaded in the order
// index.html lists them. Collect every top-level name they declare so ESLint knows about them.
const appGlobals = {};
for (const f of fs.readdirSync('js')) {
  const ast = espree.parse(fs.readFileSync('js/' + f, 'utf8'), { ecmaVersion: 2023, sourceType: 'script' });
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') appGlobals[node.id.name] = 'writable';
    if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') appGlobals[d.id.name] = 'writable';
  }
}

export default [
  { ignores: ['node_modules/', 'test/out/', 'vendor/'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, ...appGlobals } },
    rules: {
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'off',            // each file's own names are also in appGlobals
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['config.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['sw.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker },
  },
  {
    files: ['serve.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['test/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }], 'no-unused-vars': ['warn', { caughtErrors: 'none' }] },
  },
];
