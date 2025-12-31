// Jest test setup file

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.APP_ENVIRONMENT = 'test';

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeEach(() => {
  // Reset console mocks before each test
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  // Restore console after each test
  Object.assign(console, originalConsole);
});

// Global test timeout
jest.setTimeout(10000);