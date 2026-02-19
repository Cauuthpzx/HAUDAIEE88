import js from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

// Layui 全局变量定义
globals.layui = {
  layui: false,
  lay: false,
  // jQuery
  $: false,
  jQuery: false,
  // 国际化 API
  Intl: false,
  // 模块系统支持
  exports: false, // CommonJS 导出对象
  module: false, // CommonJS 模块对象
  require: false, // CommonJS 导入函数
  define: false // AMD/RequireJS 模块定义函数
};

export default defineConfig([
  // Global ignores
  globalIgnores([
    '**/dist/',
    '**/node_modules/',
    '.temp/**',
    'docs/**',
    'src/modules/jquery.js',
    // Vendor/minified — không lint
    'Project_EE88/client/lib/**',
    'Project_EE88/spa/lib/**'
  ]),

  // ── Layui source (src/) — Browser ES5, IE9+ ──
  {
    files: ['src/**/*.js'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.layui }
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-unused-vars': [
        'warn',
        { args: 'none', caughtErrors: 'none', vars: 'local' }
      ],
      'no-redeclare': 'warn',
      'no-useless-escape': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'off',
      'no-var': 'off',
      'prefer-arrow-callback': 'off',
      'prefer-template': 'off',
      'object-shorthand': 'off',
      'prefer-destructuring': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off',
      'func-style': 'off',
      'no-inner-declarations': 'off'
    }
  },

  // ── Project frontend (client/js, spa/js) — Browser, layui globals ──
  {
    files: ['Project_EE88/client/js/**/*.js', 'Project_EE88/spa/js/**/*.js'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        layui: 'writable',
        echarts: 'readonly',
        HubAPI: 'writable',
        HubLang: 'writable',
        HubUtils: 'writable',
        HubCache: 'readonly',
        SpaPages: 'writable',
        XLSX: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { args: 'none', caughtErrors: 'none', vars: 'local' }
      ],
      'no-redeclare': 'off',
      'no-useless-escape': 'warn',
      'no-empty': 'warn',
      'no-prototype-builtins': 'off',
      'no-var': 'off',
      'prefer-const': 'off',
      'prefer-template': 'off',
      'prefer-arrow-callback': 'off',
      'object-shorthand': 'off',
      'no-inner-declarations': 'off'
    }
  },

  // ── Project server (Node.js, CommonJS, ES2022) ──
  {
    files: [
      'Project_EE88/server/**/*.js',
      'Project_EE88/scripts/**/*.js',
      'scripts/**/*.js'
    ],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': 'warn'
    }
  },

  // ── Root config files ──
  {
    files: ['*.{js,cjs,mjs}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {}
  },

  eslintConfigPrettier
]);
