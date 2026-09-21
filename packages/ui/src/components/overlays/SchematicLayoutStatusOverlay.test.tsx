import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test-utils';
import { SchematicLayoutStatusOverlay } from './SchematicLayoutStatusOverlay';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('SchematicLayoutStatusOverlay', () => {
  it('explains grid capacity failure safely and keeps the diagnostic code optional', () => {
    render(
      <SchematicLayoutStatusOverlay
        progress={null}
        failed
        diagnostic={{ phase: 'laying-out', code: 'GRID_CAPACITY_EXCEEDED' }}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'schematicLayoutStatus.failed',
    );
    expect(
      screen.getByText('schematicLayoutStatus.GRID_CAPACITY_EXCEEDED'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('schematic-layout-diagnostic')).toHaveTextContent(
      'GRID_CAPACITY_EXCEEDED',
    );
  });
});
