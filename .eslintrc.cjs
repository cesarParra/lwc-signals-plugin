module.exports = {
  extends: ['eslint-config-salesforce-typescript', 'plugin:sf-plugin/recommended'],
  root: true,
  rules: {
    header: 'off',
    'no-console': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-shadow': 'off',
  },
};
