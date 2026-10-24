/** @type {import('jest').Config} */
const tsJestPath = require.resolve("ts-jest");

module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      tsJestPath,
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json",
        diagnostics: true
      }
    ]
  },
  moduleNameMapper: {
    "^@century/data$": "<rootDir>/../data/src/index.ts",
    "^@century/sim$": "<rootDir>/../sim/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
};
