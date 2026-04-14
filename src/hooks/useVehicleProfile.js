import { useState, useEffect } from 'react';
import { ref, get, set as dbSet } from 'firebase/database';
import { database } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_VEHICLE, getVehicleById } from '../data/vehicles';

/**
 * Reads and writes the user's vehicle profile from Firebase.
 * Falls back to DEFAULT_VEHICLE (sedan) when:
 *   - user is not authenticated
 *   - Firebase read fails
 *   - saved vehicleId is no longer in PRESET_VEHICLES
 *
 * @returns {{ vehicle: Object, setVehicle: Function, loading: boolean }}
 */
export default function useVehicleProfile() {
  const { user } = useAuth();
  const [vehicle, setVehicleState] = useState(DEFAULT_VEHICLE);
  const [loading, setLoading] = useState(true);

  // Load from Firebase on mount / user change
  useEffect(() => {
    if (!user) {
      setVehicleState(DEFAULT_VEHICLE);
      setLoading(false);
      return;
    }

    const profileRef = ref(database, `users/${user.uid}/vehicle`);
    get(profileRef)
      .then(snapshot => {
        const data = snapshot.val();
        if (data?.vehicleId) {
          setVehicleState(getVehicleById(data.vehicleId));
        }
      })
      .catch(() => {
        // Silent fallback — user still gets DEFAULT_VEHICLE
      })
      .finally(() => setLoading(false));
  }, [user]);

  /**
   * Save a new vehicle selection. Optimistically updates local state.
   * Throws on Firebase write failure so caller can show a toast.
   * @param {Object} preset - one of PRESET_VEHICLES
   * @returns {Promise<void>}
   */
  const setVehicle = async (preset) => {
    setVehicleState(preset);
    if (!user) return;

    const profileRef = ref(database, `users/${user.uid}/vehicle`);
    await dbSet(profileRef, {
      vehicleId: preset.id,
      groundClearanceCm: preset.groundClearanceCm,
    });
  };

  return { vehicle, setVehicle, loading };
}
