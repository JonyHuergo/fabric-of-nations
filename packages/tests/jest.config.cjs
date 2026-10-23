/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json",
        diagnostics: true
      }
    ]
  },
  moduleNameMapper: {
    "^@century/sim$": "<rootDir>/../sim/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
};
