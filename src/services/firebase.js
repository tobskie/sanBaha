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

// Real-time listener for flood sensor data
export const subscribeToFloodData = (callback) => {
  const sensorsRef = ref(database, 'flood_sensors');
  
  const unsubscribe = onValue(sensorsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const sensors = Object.keys(data).map(key => {
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

        return {
          id: key,
          ...item,
          coordinates: coords,
          status: getStatusFromWaterLevel(item.waterLevel)
        };
      });
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
