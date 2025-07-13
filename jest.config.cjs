/**
 * Jest configuration for ESM support in a "type: module" project.
 */
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
};