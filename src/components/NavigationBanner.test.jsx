import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NavigationBanner from './NavigationBanner';

const makeStep = (type, modifier, instruction, distance, name) => ({
  maneuver: { type, modifier, instruction, location: [121.15, 13.94] },
  distance,
  duration: 30,
  name,
  intersections: [],
  geometry: { type: 'LineString', coordinates: [[121.15, 13.94], [121.151, 13.94]] },
});

const STEPS = [
  makeStep('turn', 'right', 'Turn right onto Rizal Ave', 200, 'Rizal Ave'),
  makeStep('turn', 'left', 'Turn left onto Mabini St', 650, 'Mabini St'),
  makeStep('arrive', undefined, 'Arrive at destination', 0, ''),
];

const baseProps = {
  currentStep: STEPS[0],
  steps: STEPS,
  distanceToManeuver: 200,
  remainingDistance: 2300,
  remainingDuration: 480,
  destination: 'Mabini St',
  stepsWithFloodWarning: new Set(),
  currentLanes: null,
  isOffRoute: false,
  onEnd: vi.fn(),
};

describe('NavigationBanner', () => {
  it('renders null when no currentStep', () => {
    const { container } = render(<NavigationBanner {...baseProps} currentStep={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows instruction and distance', () => {
    render(<NavigationBanner {...baseProps} />);
    expect(screen.getByText('Turn right onto Rizal Ave')).toBeInTheDocument();
    expect(screen.getByText(/200m/)).toBeInTheDocument();
  });

  it('shows ETA', () => {
    render(<NavigationBanner {...baseProps} />);
    expect(screen.getByText('8 min')).toBeInTheDocument();
  });

  it('step list is hidden by default', () => {
    render(<NavigationBanner {...baseProps} />);
    expect(screen.queryByText('Turn left onto Mabini St')).not.toBeInTheDocument();
  });

  it('expands step list when banner is tapped', () => {
    render(<NavigationBanner {...baseProps} />);
    fireEvent.click(screen.getByTestId('nav-banner-header'));
    expect(screen.getByText('Turn left onto Mabini St')).toBeInTheDocument();
  });

  it('shows flood warning on affected steps', () => {
    render(<NavigationBanner {...baseProps} stepsWithFloodWarning={new Set([1])} />);
    fireEvent.click(screen.getByTestId('nav-banner-header'));
    expect(screen.getByText(/Flood zone/)).toBeInTheDocument();
  });

  it('shows re-routing state when isOffRoute is true', () => {
    render(<NavigationBanner {...baseProps} isOffRoute={true} />);
    expect(screen.getByText(/Re-routing/i)).toBeInTheDocument();
  });

  it('calls onEnd when End button is tapped', () => {
    const onEnd = vi.fn();
    render(<NavigationBanner {...baseProps} onEnd={onEnd} />);
    fireEvent.click(screen.getByText('End'));
    expect(onEnd).toHaveBeenCalled();
  });

  it('does not expand when isOffRoute is true and banner is tapped', () => {
    render(<NavigationBanner {...baseProps} isOffRoute={true} />);
    fireEvent.click(screen.getByTestId('nav-banner-header'));
    expect(screen.queryByText('Turn left onto Mabini St')).not.toBeInTheDocument();
  });

  it('footer is always visible', () => {
    render(<NavigationBanner {...baseProps} />);
    expect(screen.getByText(/Mabini St/)).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('step list collapses on second tap', () => {
    render(<NavigationBanner {...baseProps} />);
    fireEvent.click(screen.getByTestId('nav-banner-header'));
    expect(screen.getByText('Turn left onto Mabini St')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('nav-banner-header'));
    expect(screen.queryByText('Turn left onto Mabini St')).not.toBeInTheDocument();
  });
});
