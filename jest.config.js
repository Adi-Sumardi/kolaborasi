const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  transformIgnorePatterns: [
    '/node_modules/(?!(sonner|lucide-react)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/tests/__mocks__/fileMock.js',
    '^electron$': '<rootDir>/tests/__mocks__/electron.js',
    '^electron-store$': '<rootDir>/tests/__mocks__/electron-store.js',
    '^sharp$': '<rootDir>/tests/__mocks__/sharp.js',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/electron-app/', '<rootDir>/desktop-agent/'],
  collectCoverageFrom: [
    'lib/**/*.{js,jsx}',
    'components/**/*.{js,jsx}',
    'app/**/*.{js,jsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
};

module.exports = createJestConfig(customJestConfig);
