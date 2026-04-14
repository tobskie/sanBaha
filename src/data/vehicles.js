// src/data/vehicles.js

export const PRESET_VEHICLES = [
  { id: 'motorcycle', name: 'Motorcycle',  groundClearanceCm: 12, toleranceLevel: 1 },
  { id: 'sedan',      name: 'Sedan',       groundClearanceCm: 15, toleranceLevel: 1 },
  { id: 'van',        name: 'Van',         groundClearanceCm: 18, toleranceLevel: 2 },
  { id: 'suv',        name: 'SUV',         groundClearanceCm: 22, toleranceLevel: 3 },
  { id: 'pickup',     name: 'Pickup',      groundClearanceCm: 28, toleranceLevel: 4 },
];

export const DEFAULT_VEHICLE = PRESET_VEHICLES.find(v => v.id === 'sedan');

/**
 * Compute vehicle-adjusted flood tier thresholds in cm.
 * passableMax: water depth below which the road is safely passable
 * warningMax:  water depth below which the road is passable with caution
 * At or above warningMax the road is considered flooded (impassable).
 *
 * @param {{ groundClearanceCm: number }} vehicle
 * @returns {{ passableMax: number, warningMax: number }}
 */
export function getAdjustedThresholds(vehicle) {
  const clearance = vehicle?.groundClearanceCm;
  if (!clearance || clearance <= 0 || !isFinite(clearance)) {
    return getAdjustedThresholds(DEFAULT_VEHICLE);
  }
  return {
    passableMax: clearance * 0.6,
    warningMax:  clearance * 1.0,
  };
}

/**
 * Look up a preset by id. Returns DEFAULT_VEHICLE if id is unknown.
 * @param {string} id
 * @returns {Object}
 */
export function getVehicleById(id) {
  return PRESET_VEHICLES.find(v => v.id === id) ?? DEFAULT_VEHICLE;
}
