// Mock sensor data for sanBaha flood monitoring system
// This simulates real-time telemetry from flood sensors across Lipa City



// Status thresholds (in cm)
export const STATUS_THRESHOLDS = {
    clear: { max: 25, label: "Passable", color: "#00ff88" },
    warning: { min: 25, max: 70, label: "Gutter Deep", color: "#ffcc00" },
    flooded: { min: 70, label: "Not Passable", color: "#ff4444" },
};

// Helper function to determine status based on water level
export const getStatusFromWaterLevel = (waterLevel) => {
    if (waterLevel < 25) return "clear";
    if (waterLevel < 70) return "warning";
    return "flooded";
};

// Helper function to get status details
export const getStatusDetails = (status) => {
    return STATUS_THRESHOLDS[status] || STATUS_THRESHOLDS.clear;
};

/* 
// ============================================
// FIREBASE REAL-TIME LISTENER (COMMENTED OUT)
// ============================================
// Uncomment this section to use Firebase Realtime Database

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

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
    }
  });
  
  return unsubscribe;
};

// ============================================
// FETCH API ALTERNATIVE (COMMENTED OUT)
// ============================================
// Use this if you have a REST API instead of Firebase

export const fetchFloodData = async () => {
  try {
    const response = await fetch('https://your-api.com/api/flood-sensors');
    if (!response.ok) throw new Error('Failed to fetch data');
    const data = await response.json();
    return data.map(sensor => ({
      ...sensor,
      status: getStatusFromWaterLevel(sensor.waterLevel)
    }));
  } catch (error) {
    console.error('Error fetching flood data:', error);
    return [];
  }
};

*/
