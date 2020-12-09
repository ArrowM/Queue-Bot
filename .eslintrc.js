module.exports = {
  env: {
    commonjs: true,
    es6: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:prettier/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 12
  },
  plugins: [
    'node',
    'promise',
    'import',
    'prettier'
  ],
  rules: {
    'prettier/prettier': ["warn", {
        "endOfLine": "auto",
        "printWidth": 120,
        "tabWidth": 3
    }],
    'no-console': 'off'
  }
}
