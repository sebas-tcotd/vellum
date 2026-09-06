// packages/ui/src/test-setup.ts
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';
import { expect } from 'vitest';

// jsdom doesn't implement ResizeObserver
global.ResizeObserver = class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Extendemos explícitamente en lugar de usar '@testing-library/jest-dom/vitest'
// para evitar problemas de auto-detección con la extensión de VSCode.
expect.extend(matchers);

// jsdom reports a 1024 px window, which is a narrow desktop by Vellum's own
// width model and would start every test with a compact sidebar. Default to
// the standard desktop configuration instead; the tests that care about
// narrow behaviour set their own width.
Object.defineProperty(window, 'innerWidth', {
  configurable: true,
  writable: true,
  value: 1440,
});
