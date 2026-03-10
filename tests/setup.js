require('@testing-library/jest-dom');

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    const { fill, priority, ...rest } = props;
    return require('react').createElement('img', rest);
  },
}));

// Only set browser mocks when running in jsdom environment
if (typeof window !== 'undefined') {
  // Mock window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: undefined,
    writable: true,
  });

  // Mock localStorage
  const localStorageMock = (() => {
    let store = {};
    return {
      getItem: jest.fn((key) => store[key] || null),
      setItem: jest.fn((key, value) => { store[key] = String(value); }),
      removeItem: jest.fn((key) => { delete store[key]; }),
      clear: jest.fn(() => { store = {}; }),
    };
  })();
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });
}

// Mock fetch
global.fetch = jest.fn();

// Mock ResizeObserver (used by Radix UI)
global.ResizeObserver = class ResizeObserver {
  constructor(cb) { this.cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Suppress console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning:')) return;
    originalError.call(console, ...args);
  };
});
afterAll(() => { console.error = originalError; });
