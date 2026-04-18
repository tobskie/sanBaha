import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, get, set as dbSet, runTransaction, update } from 'firebase/database';
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
export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  const { uid, displayName, email } = result.user;
  const userRef = ref(database, `users/${uid}`);
  const snap = await get(userRef);
  if (!snap.exists()) {
    await update(userRef, { displayName, email, role: 'citizen' });
  }
  return result;
};

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

const EXPIRY_UNVERIFIED_MS = 6  * 60 * 60 * 1000; // 6 hours
const EXPIRY_VERIFIED_MS   = 24 * 60 * 60 * 1000; // 24 hours

// Real-time listener for crowdsourced flood reports.
// Fires immediately on subscribe and on every new/changed report.
// Reports are filtered client-side: unverified expire after 6 h, verified after 24 h.
// Returns unsubscribe function.
export const subscribeToCrowdReports = (callback) => {
  const reportsRef = ref(database, 'crowd_reports');
  return onValue(reportsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) { callback([]); return; }
    const now = Date.now();
    const reports = Object.entries(data)
      .map(([key, item]) => ({
        id: item.id || key,
        name: (item.locationName || 'User Report').split(',')[0].trim(),
        location: item.locationName || 'Unknown Location',
        coordinates: item.coordinates || [0, 0],
        waterLevel: item.severity === 'flooded' ? 80 : item.severity === 'warning' ? 50 : 10,
        status: item.severity || 'warning',
        lastUpdate: item.reportedAt || item.submittedAt,
        type: 'crowdsourced',
        verified: item.verified || false,
        reporterId: item.reporterId,
        description: item.description,
      }))
      .filter(r => {
        if (r.status === 'clear') return false;
        const age = now - new Date(r.lastUpdate).getTime();
        const ttl = r.verified ? EXPIRY_VERIFIED_MS : EXPIRY_UNVERIFIED_MS;
        return age < ttl;
      });
    callback(reports);
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

// ---------- Crowdsource Verification ----------

/**
 * Subscribe to real-time verification data for a report.
 * Calls callback with { count, verified, users } whenever data changes.
 * Returns an unsubscribe function.
 */
export const subscribeToVerification = (reportId, callback) => {
  const verifRef = ref(database, `verifications/${reportId}`);
  return onValue(verifRef, (snap) => {
    const data = snap.val() || { count: 0, users: {}, verified: false };
    callback(data);
  });
};

/**
 * Record one verification for userId on the given report.
 * Throws Error('already_verified') if the user already verified this report.
 * Returns { count, verified } after writing.
 */
export const submitVerification = async (reportId, userId) => {
  const userPath = `verifications/${reportId}/users/${userId}`;
  const existing = await get(ref(database, userPath));
  if (existing.val()) throw new Error('already_verified');

  await dbSet(ref(database, userPath), true);

  const countRef = ref(database, `verifications/${reportId}/count`);
  let newCount;
  await runTransaction(countRef, (current) => {
    newCount = (current || 0) + 1;
    return newCount;
  });

  if (newCount >= 3) {
    await Promise.all([
      dbSet(ref(database, `verifications/${reportId}/verified`), true),
      dbSet(ref(database, `crowd_reports/${reportId}/verified`), true),
    ]);
  }

  return { count: newCount, verified: newCount >= 3 };
};

/**
 * Subscribe to media upload metadata for a report.
 * Fires callback with { downloadURL, isVideo } when the URL becomes available.
 * Returns an unsubscribe function.
 */
export const subscribeToReportMedia = (reportId, callback) => {
  const mediaRef = ref(database, `media_uploads/${reportId}`);
  return onValue(mediaRef, (snap) => {
    const data = snap.val();
    if (data?.downloadURL) {
      callback({ downloadURL: data.downloadURL, isVideo: data.isVideo || false });
    }
  });
};

export const subscribeToAlerts = (callback) => {
  const alertsRef = ref(database, 'alerts');
  return onValue(alertsRef, (snap) => {
    const data = snap.val() || {};
    const now = new Date();
    const active = Object.entries(data)
      .map(([id, item]) => ({ id, ...item }))
      .filter((a) => new Date(a.expiresAt) > now);
    active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    callback(active);
  });
};
