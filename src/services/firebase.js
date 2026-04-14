import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, get, set as dbSet } from 'firebase/database';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getStatusFromWaterLevel } from '../data/mockData';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Sign in with Google
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

// Sign out
export const logOut = () => signOut(auth);

// Auth state listener
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// Submit crowdsourced flood report to Firebase
export const submitFloodReport = (report) => {
  const reportsRef = ref(database, 'crowd_reports');
  return push(reportsRef, {
    ...report,
    submittedAt: new Date().toISOString(),
  });
};

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW50b25vbGltcG8iLCJhIjoiY21sZjYxdnNrMDFmbjNmcjVnZGFmZmlwaiJ9.p6iMH63mAesUTBbpoufwBw';

// Cache to avoid re-fetching the same coordinates
const geocodeCache = {};

const reverseGeocode = async (lat, lng) => {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (geocodeCache[key]) return geocodeCache[key];

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=neighborhood,locality,place&limit=1&access_token=${MAPBOX_TOKEN}`
    );
    const json = await res.json();
    const feature = json.features?.[0];
    const result = feature
      ? { name: feature.text, location: feature.place_name.split(',').slice(0, 3).join(',') }
      : null;
    geocodeCache[key] = result;
    return result;
  } catch {
    return null;
  }
};

// Real-time listener for flood sensor data
export const subscribeToFloodData = (callback) => {
  const sensorsRef = ref(database, 'flood_sensors');

  const unsubscribe = onValue(sensorsRef, async (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const sensors = await Promise.all(Object.keys(data).map(async key => {
        const item = data[key];
        let lat = item.latitude || item.lat;
        let lng = item.longitude || item.lng || item.long;
        let coords = item.coordinates;

        // If coordinates array is not explicitly present, try to extract from lat/lng
        if (!coords && lat !== undefined && lng !== undefined) {
          coords = [parseFloat(lat), parseFloat(lng)];
        } else if (!coords) {
          // Default fallback coordinates if none provided
          coords = [13.9411, 121.1636];
        }

        // Reverse-geocode the location name from sensor coordinates
        const [sLat, sLng] = coords;
        const geocoded = await reverseGeocode(sLat, sLng);

        return {
          id: key,
          ...item,
          coordinates: coords,
          name: geocoded?.name || item.name || key,
          location: geocoded?.location || item.location || 'Unknown location',
          status: getStatusFromWaterLevel(item.waterLevel)
        };
      }));
      callback(sensors);
    } else {
      callback([]); // Handle empty database
    }
  });

  return unsubscribe;
};

// Media consent helpers
export const hasMediaConsent = async (uid) => {
  const snap = await get(ref(database, `users/${uid}/mediaConsentGiven`));
  return snap.val() === true;
};

export const setMediaConsent = (uid) =>
  dbSet(ref(database, `users/${uid}/mediaConsentGiven`), true);
