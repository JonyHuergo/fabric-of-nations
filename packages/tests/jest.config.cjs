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
    "^@century/sim-worker$": "<rootDir>/../sim-worker/src/index.ts",
    "^@century/sim-worker/host$": "<rootDir>/../sim-worker/src/host.ts",
    "^@century/sim-worker/persistence$": "<rootDir>/../sim-worker/src/persistence.ts",
    "^@century/sim-worker/snapshot$": "<rootDir>/../sim-worker/src/snapshot.ts",
    "^@react-native-async-storage/async-storage$":
      "<rootDir>/src/fixtures/asyncStorageMock.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
};
