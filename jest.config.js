module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/packages/**/src/__tests__/**/*.test.ts',
    '<rootDir>/packages/**/tests/**/*.test.ts'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.base.json'
    }]
  },
  moduleNameMapper: {
    '^@excerpt/clipping-core$': '<rootDir>/packages/clipping-core/dist/index.js',
    '^@excerpt/shared$': '<rootDir>/packages/shared/dist/index.js',
    '^@excerpt/video-worker$': '<rootDir>/packages/video-worker/dist/index.js'
  },
  modulePathIgnorePatterns: [
    '<rootDir>/apps/web/.next',
    '<rootDir>/apps/web/.netlify',
    '<rootDir>/dist',
    '<rootDir>/packages/*/dist'
  ]
};
