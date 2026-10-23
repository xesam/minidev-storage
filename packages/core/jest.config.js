module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    collectCoverageFrom: ['src/**/*.ts', '!src/types.ts'],
    coverageDirectory: 'coverage',
    coverageThreshold: {
        global: { branches: 100, functions: 100, lines: 100, statements: 100 }
    },
    testMatch: ['**/*.test.ts']
};
