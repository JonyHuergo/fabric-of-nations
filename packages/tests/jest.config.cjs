/** @type {import('jest').Config} */
const tsJestPath = require.resolve("ts-jest");

module.exports = {
  testEnvironment: "node",
  // D-155: one worker process, replaced after every suite (any finished suite leaves
  // more than this limit behind). Running in band kept every suite's leftovers in one
  // process until the 1900-world suites exhausted the heap; a fresh worker starts each
  // suite empty, so the run's peak is the largest single suite, not a sum. The heap
  // ceiling itself is the test script's --max-old-space-size (package.json).
  maxWorkers: 1,
  workerIdleMemoryLimit: "1MB",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      tsJestPath,
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json",
        // D-155: transpile each file on its own. Type checking inside Jest kept a
        // TypeScript language service of the whole program in every test process
        // (about 240 MB per process, growing across files); `pnpm typecheck` type-checks
        // this package, so the tests no longer repeat it.
        isolatedModules: true
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
