/**
 * Root-level Jest configuration: support ESM tests and ignore archive folder
 */
module.exports = {
	testEnvironment: 'node',
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	transform: {},
	testPathIgnorePatterns: ['<rootDir>/_archive/', '<rootDir>/node_modules/'],
};