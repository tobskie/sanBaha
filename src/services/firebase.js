import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
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

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Sign in with Google
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

// Sign out
export const logOut = () => signOut(auth);

// Auth state listener
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

// Real-time listener for flood sensor data
export const subscribeToFloodData = (callback) => {
  const sensorsRef = ref(database, 'flood_sensors');
  
  const unsubscribe = onValue(sensorsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const sensors = Object.keys(data).map(key => ({
        id: key,
        ...data[key],
        status: getStatusFromWaterLevel(data[key].waterLevel)
      }));
      callback(sensors);
    } else {
      callback([]); // Handle empty database
    }
  });
  
  return unsubscribe;
};
