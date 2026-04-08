// packages/ui/src/test-utils.tsx
// Re-exporta todo @testing-library/react y extiende los matchers de jest-dom
// directamente en el import, sin depender de setupFiles.
// Úsalo en lugar de '@testing-library/react' en todos los test files de este package.
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';

expect.extend(matchers);

export * from '@testing-library/react';
