import { ref, onValue, update, remove, push } from 'firebase/database';
import { database, auth } from './firebase';

// --- Reports ---

export const subscribeToAllReports = (callback) => {
  return onValue(ref(database, 'crowd_reports'), (snap) => {
    const data = snap.val() || {};
    const reports = Object.entries(data).map(([id, item]) => ({ id, ...item }));
    reports.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    callback(reports);
  });
};

export const adminVerifyReport = async (id) => {
  await update(ref(database, `crowd_reports/${id}`), { verified: true });
  await update(ref(database, `verifications/${id}`), { verified: true });
};

export const adminDeleteReport = (id) =>
  update(ref(database, '/'), {
    [`crowd_reports/${id}`]: null,
    [`verifications/${id}`]: null,
    [`media_uploads/${id}`]: null,
  });

// --- Sensors ---

export const subscribeToAllSensors = (callback) => {
  return onValue(ref(database, 'flood_sensors'), (snap) => {
    const data = snap.val() || {};
    const sensors = Object.entries(data).map(([id, item]) => ({ id, ...item }));
    callback(sensors);
  });
};

export const adminUpdateSensor = (id, fields) =>
  update(ref(database, `flood_sensors/${id}`), fields);

export const adminAddSensor = (fields) =>
  push(ref(database, 'flood_sensors'), fields);

export const adminDeleteSensor = (id) =>
  remove(ref(database, `flood_sensors/${id}`));

// --- Users ---

export const subscribeToAllUsers = (callback) => {
  return onValue(ref(database, 'users'), (snap) => {
    const data = snap.val() || {};
    const users = Object.entries(data).map(([uid, item]) => ({ uid, ...item }));
    callback(users);
  });
};

export const adminSetUserRole = async (uid, role) => {
  await update(ref(database, `users/${uid}`), { role });
  await push(ref(database, 'logs'), {
    type: 'role_change',
    targetUid: uid,
    newRole: role,
    changedBy: auth.currentUser?.uid ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
};

// --- Alerts ---

export const subscribeToAllAlerts = (callback) => {
  return onValue(ref(database, 'alerts'), (snap) => {
    const data = snap.val() || {};
    const alerts = Object.entries(data).map(([id, item]) => ({ id, ...item }));
    alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    callback(alerts);
  });
};

export const adminPublishAlert = (message, severity, expiresAt, createdBy) =>
  push(ref(database, 'alerts'), {
    message,
    severity,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdBy,
  });

export const adminExpireAlert = (id) =>
  update(ref(database, `alerts/${id}`), { expiresAt: new Date().toISOString() });

// --- Logs ---

export const subscribeToLogs = (callback) => {
  return onValue(ref(database, 'logs'), (snap) => {
    const data = snap.val() || {};
    const logs = Object.entries(data).map(([id, item]) => ({ id, ...item }));
    logs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    callback(logs);
  });
};
