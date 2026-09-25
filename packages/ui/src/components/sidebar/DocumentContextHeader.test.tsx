import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test-utils';
import { DocumentContextHeader } from './DocumentContextHeader';

function renderHeader(source?: 'cslmap' | 'vellummap') {
  render(
    <DocumentContextHeader
      cityName="Costa Tijuca"
      fileName="costa-tijuca.cslmap"
      source={source}
      collapsed={false}
      onToggleCollapsed={() => {}}
    />,
  );
}

describe('DocumentContextHeader — source chip', () => {
  it('labels a .cslmap city with a discreet chip that explains itself', () => {
    renderHeader('cslmap');
    const chip = screen.getByText('documentContext.cslmapChip');
    expect(chip.getAttribute('title')).toBe('documentContext.cslmapChipHint');
    // A chip beside the name, never an alert or banner.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows no chip for a native document: the normal case is not labelled', () => {
    renderHeader('vellummap');
    expect(screen.queryByText('documentContext.cslmapChip')).toBeNull();
  });
});
