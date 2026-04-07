// packages/ui/src/test-setup.ts
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';
import { expect } from 'vitest';

// Extendemos explícitamente en lugar de usar '@testing-library/jest-dom/vitest'
// para evitar problemas de auto-detección con la extensión de VSCode.
expect.extend(matchers);
