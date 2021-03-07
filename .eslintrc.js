module.exports = {
   env: {
      //commonjs: true,
      es6: true,
      node: true,
   },
   extends: ["eslint:recommended", "plugin:prettier/recommended"],
   parser: "@typescript-eslint/parser",
   parserOptions: {
      files: "*.ts",
      ecmaVersion: 12,
   },
   plugins: ["node", "promise", "import", "prettier"],
   rules: {
      "prettier/prettier": [
         "warn",
         {
            endOfLine: "auto",
            printWidth: 140,
            tabWidth: 3,
         },
      ],
      "no-console": "off",
   },
};

//{
//  "parserOptions": {
//    "ecmaVersion": 6,
//    "sourceType": "module",
//    "ecmaFeatures": {
//      "jsx": true // Allows support of JSX, but use of React plugin is required to support React semantics
//    }
//  },
//  // @typescript-eslint/parser is specified as a command line argument
//  "plugins": [
//    "node",
//    "promise",
//    "react",
//    "@typescript-eslint"
//  ],
//  "env": {
//    "amd": true,
//    "browser": true,
//    "jquery": true,
//    "node": true,
//    "es6": true, // This enables ES6 global variables AND ES6 syntax
//    "worker": true
//  },
//  "rules": {
//    // The below are some, but not all, of the rules from eslint:recommended https://github.com/eslint/eslint/blob/master/conf/eslint-recommended.js (all errors set to warning)
//    "constructor-super": 1,
//    "for-direction": 1,
//    "getter-return": 1,
//    "no-async-promise-executor": 1,
//    "no-case-declarations": 1,
//    "no-class-assign": 1,
//    "no-compare-neg-zero": 1,
//    "no-cond-assign": 1,
//    "no-const-assign": 1,
//    "no-constant-condition": 1,
//    "no-control-regex": 1,
//    "no-debugger": 1,
//    "no-delete-var": 1,
//    "no-dupe-args": 1,
//    "no-dupe-class-members": 1,
//    "no-dupe-keys": 1,
//    "no-duplicate-case": 1,
//    "no-empty": 1,
//    "no-empty-character-class": 1,
//    "no-empty-pattern": 1,
//    "no-ex-assign": 1,
//    "no-extra-boolean-cast": 1,
//    "no-fallthrough": 1,
//    "no-func-assign": 1,
//    "no-global-assign": 1,
//    "no-inner-declarations": 1,
//    "no-invalid-regexp": 1,
//    "no-misleading-character-class": 1,
//    "no-mixed-spaces-and-tabs": 1,
//    "no-new-symbol": 1,
//    "no-obj-calls": 1,
//    "no-octal": 1,
//    "no-prototype-builtins": 1,
//    "no-redeclare": 1,
//    "no-regex-spaces": 1,
//    "no-self-assign": 1,
//    "no-shadow-restricted-names": 1,
//    "no-sparse-arrays": 1,
//    "no-this-before-super": 1,
//    "no-unexpected-multiline": 1,
//    "no-unreachable": 1,
//    "no-unsafe-finally": 1,
//    "no-unsafe-negation": 1,
//    "no-unused-labels": 1,
//    "no-useless-catch": 1,
//    "no-useless-escape": 1,
//    "no-with": 1,
//    "require-atomic-updates": 1,
//    "require-yield": 1,
//    "use-isnan": 1,
//    "valid-typeof": 1,

//    // Other rules
//    "default-param-last": 1,
//    "eqeqeq": 0,

//    // The below are some, but not all, of the rules from eslint-plugin-react:recommended https://github.com/yannickcr/eslint-plugin-react#recommended (all errors set to warn)
//    "react/display-name": 1,
//    "react/jsx-no-duplicate-props": 1,
//    "react/jsx-no-undef": 1,
//    "react/jsx-uses-react": 1,
//    "react/jsx-uses-vars": 1,
//    "react/no-children-prop": 1,
//    "react/no-danger-with-children": 1,
//    "react/no-deprecated": 1,
//    "react/no-direct-mutation-state": 1,
//    "react/no-find-dom-node": 1,
//    "react/no-is-mounted": 1,
//    "react/no-render-return-value": 1,
//    "react/no-string-refs": 1,
//    "react/no-unescaped-entities": 1,
//    "react/no-unknown-property": 1,
//    "react/require-render-return": 1,

//    // Some additional React rules
//    "react/no-danger": 1,
//    "react/no-did-mount-set-state": 1,
//    "react/no-did-update-set-state": 1
//  },

//  "overrides": [
//    {
//      "files": [ "*.ts", "*.tsx" ],
//      "rules": {
//        // The below are all rules from @typescript-eslint/eslint:recommended https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/src/configs/eslint-recommended.ts (all errors set to warn)
//        "getter-return": 0, //Checked by Typescript - ts(2378)
//        "no-dupe-args": 0, // Checked by Typescript - ts(2300)
//        "no-dupe-keys": 0, // Checked by Typescript - ts(1117)
//        "no-unreachable": 0, // Checked by Typescript - ts(7027)
//        "valid-typeof": 0, // Checked by Typescript - ts(2367)
//        "no-const-assign": 0, // Checked by Typescript - ts(2588)
//        "no-new-symbol": 0, // Checked by Typescript - ts(2588)
//        "no-this-before-super": 0, // Checked by Typescript - ts(2376)
//        "no-undef": 0, // This is checked by Typescript using the option `strictNullChecks`.
//        "no-dupe-class-members": 0, // This is already checked by Typescript.
//        "no-redeclare": 0, // This is already checked by Typescript.

//        // The below is some, but not all, of the rules from @typescript-eslint/recommended https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/src/configs/recommended.json (all errors set to warn)
//        "@typescript-eslint/adjacent-overload-signatures": 1,
//        "@typescript-eslint/ban-ts-ignore": 1,
//        "@typescript-eslint/ban-types": 1,
//        "camelcase": 0,
//        "@typescript-eslint/camelcase": 1,
//        "@typescript-eslint/class-name-casing": 1,
//        "@typescript-eslint/consistent-type-assertions": 1,
//        "@typescript-eslint/interface-name-prefix": 1,
//        "@typescript-eslint/member-delimiter-style": 1,
//        "no-array-constructor": 0,
//        "@typescript-eslint/no-array-constructor": 1,
//        "no-empty-function": 0,
//        "@typescript-eslint/no-empty-function": 1,
//        "@typescript-eslint/no-empty-interface": 1,
//        "@typescript-eslint/no-explicit-any": 1,
//        "@typescript-eslint/no-inferrable-types": 1,
//        "@typescript-eslint/no-misused-new": 1,
//        "@typescript-eslint/no-namespace": 1,
//        "@typescript-eslint/no-non-null-assertion": 1,
//        "@typescript-eslint/no-this-alias": 1,
//        "no-unused-vars": 0,
//        "@typescript-eslint/no-unused-vars": 1,
//        "no-use-before-define": 0,
//        "@typescript-eslint/no-use-before-define": 1,
//        "@typescript-eslint/no-var-requires": 1,
//        "@typescript-eslint/prefer-namespace-keyword": 1,
//        "@typescript-eslint/triple-slash-reference": 1,
//        "@typescript-eslint/type-annotation-spacing": 1,
//        "no-var": 1,
//        "prefer-const": 1,
//        "prefer-rest-params": 1,
//        "prefer-spread": 1
//      }
//    }
//  ]
//}
