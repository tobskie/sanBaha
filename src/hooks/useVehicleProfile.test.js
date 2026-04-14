// src/hooks/useVehicleProfile.test.js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Firebase mocks ────────────────────────────────────────────────────────
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockRef = vi.fn((db, path) => ({ path }));

vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(() => ({})),
  ref: (db, path) => mockRef(db, path),
  get: (...args) => mockGet(...args),
  set: (...args) => mockSet(...args),
  onValue: vi.fn(),
  push: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/storage', () => ({ getStorage: vi.fn() }));

vi.mock('../data/mockData', () => ({
  getStatusFromWaterLevel: vi.fn(() => 'clear'),
}));

// ── Auth mock ─────────────────────────────────────────────────────────────
const mockUser = { uid: 'user-123' };
let authUser = null;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────
import { DEFAULT_VEHICLE, PRESET_VEHICLES } from '../data/vehicles';

beforeEach(() => {
  vi.clearAllMocks();
  authUser = null;
  mockGet.mockResolvedValue({ val: () => null });
  mockSet.mockResolvedValue(undefined);
});

describe('useVehicleProfile', () => {
  it('returns DEFAULT_VEHICLE when user is not logged in', async () => {
    authUser = null;
    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());
    // loading settles synchronously when unauthenticated
    expect(result.current.vehicle.id).toBe(DEFAULT_VEHICLE.id);
    expect(result.current.loading).toBe(false);
  });

  it('loads saved vehicle from Firebase when user is logged in', async () => {
    authUser = mockUser;
    mockGet.mockResolvedValue({ val: () => ({ vehicleId: 'suv', groundClearanceCm: 22 }) });

    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());

    // Wait for the async Firebase get to resolve
    await act(async () => {});

    expect(result.current.vehicle.id).toBe('suv');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to DEFAULT_VEHICLE when Firebase returns an unknown vehicleId', async () => {
    authUser = mockUser;
    mockGet.mockResolvedValue({ val: () => ({ vehicleId: 'hovercraft' }) });

    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());
    await act(async () => {});

    expect(result.current.vehicle.id).toBe(DEFAULT_VEHICLE.id);
  });

  it('falls back to DEFAULT_VEHICLE when Firebase read throws', async () => {
    authUser = mockUser;
    mockGet.mockRejectedValue(new Error('network error'));

    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());
    await act(async () => {});

    expect(result.current.vehicle.id).toBe(DEFAULT_VEHICLE.id);
  });

  it('setVehicle updates local state and writes to Firebase', async () => {
    authUser = mockUser;
    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());
    await act(async () => {});

    const pickup = PRESET_VEHICLES.find(v => v.id === 'pickup');
    await act(async () => {
      await result.current.setVehicle(pickup);
    });

    expect(result.current.vehicle.id).toBe('pickup');
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      { vehicleId: 'pickup', groundClearanceCm: 28 }
    );
  });

  it('setVehicle updates local state but skips Firebase write when unauthenticated', async () => {
    authUser = null;
    const { default: useVehicleProfile } = await import('./useVehicleProfile.js');
    const { result } = renderHook(() => useVehicleProfile());

    const suv = PRESET_VEHICLES.find(v => v.id === 'suv');
    await act(async () => {
      await result.current.setVehicle(suv);
    });

    expect(result.current.vehicle.id).toBe('suv');
    expect(mockSet).not.toHaveBeenCalled();
  });
});
