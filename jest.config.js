module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};
