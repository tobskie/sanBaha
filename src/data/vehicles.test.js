import { describe, it, expect } from 'vitest';
import {
  PRESET_VEHICLES,
  DEFAULT_VEHICLE,
  getAdjustedThresholds,
  getVehicleById,
} from './vehicles.js';

describe('PRESET_VEHICLES', () => {
  it('contains at least 5 entries', () => {
    expect(PRESET_VEHICLES.length).toBeGreaterThanOrEqual(5);
  });

  it('every preset has id, name, groundClearanceCm > 0, toleranceLevel 1-5', () => {
    for (const v of PRESET_VEHICLES) {
      expect(typeof v.id).toBe('string');
      expect(typeof v.name).toBe('string');
      expect(v.groundClearanceCm).toBeGreaterThan(0);
      expect(v.toleranceLevel).toBeGreaterThanOrEqual(1);
      expect(v.toleranceLevel).toBeLessThanOrEqual(5);
    }
  });
});

describe('getAdjustedThresholds', () => {
  it('sedan (15 cm) → passableMax=9, warningMax=15', () => {
    const sedan = PRESET_VEHICLES.find(v => v.id === 'sedan');
    const t = getAdjustedThresholds(sedan);
    expect(t.passableMax).toBeCloseTo(9);
    expect(t.warningMax).toBeCloseTo(15);
  });

  it('pickup (28 cm) → passableMax=16.8, warningMax=28', () => {
    const pickup = PRESET_VEHICLES.find(v => v.id === 'pickup');
    const t = getAdjustedThresholds(pickup);
    expect(t.passableMax).toBeCloseTo(16.8);
    expect(t.warningMax).toBeCloseTo(28);
  });

  it('falls back to sedan thresholds when clearance is 0', () => {
    const t = getAdjustedThresholds({ groundClearanceCm: 0 });
    const fallback = getAdjustedThresholds(DEFAULT_VEHICLE);
    expect(t.passableMax).toBeCloseTo(fallback.passableMax);
    expect(t.warningMax).toBeCloseTo(fallback.warningMax);
  });

  it('falls back to sedan thresholds when clearance is negative', () => {
    const t = getAdjustedThresholds({ groundClearanceCm: -5 });
    const fallback = getAdjustedThresholds(DEFAULT_VEHICLE);
    expect(t.passableMax).toBeCloseTo(fallback.passableMax);
    expect(t.warningMax).toBeCloseTo(fallback.warningMax);
  });

  it('falls back to sedan thresholds when vehicle is null', () => {
    const t = getAdjustedThresholds(null);
    const fallback = getAdjustedThresholds(DEFAULT_VEHICLE);
    expect(t.passableMax).toBeCloseTo(fallback.passableMax);
    expect(t.warningMax).toBeCloseTo(fallback.warningMax);
  });

  it('falls back to sedan thresholds when clearance is Infinity', () => {
    const t = getAdjustedThresholds({ groundClearanceCm: Infinity });
    const fallback = getAdjustedThresholds(DEFAULT_VEHICLE);
    expect(t.passableMax).toBeCloseTo(fallback.passableMax);
    expect(t.warningMax).toBeCloseTo(fallback.warningMax);
  });
});

describe('getVehicleById', () => {
  it('returns the correct preset for a known id', () => {
    const suv = getVehicleById('suv');
    expect(suv.id).toBe('suv');
    expect(suv.groundClearanceCm).toBe(22);
  });

  it('returns DEFAULT_VEHICLE for an unknown id', () => {
    const result = getVehicleById('flying_car');
    expect(result.id).toBe(DEFAULT_VEHICLE.id);
  });
});
