# Phase 1: Media Uploads & Operator Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow citizens to attach photos/videos to flood reports (with offline retry), persist them in Firebase Storage, and give operators a mobile triage panel plus a desktop `/admin` dashboard to review submitted media.

**Architecture:** Firebase Storage stores media under `uploads/{reportId}/`. A `process-media` Cloud Function generates thumbnails on upload. An IndexedDB-backed retry queue (via `idb-keyval`) retries failed uploads across page refreshes. The existing `ReportFloodPanel` gains an optional media step. `MobileHeader` shows a pending-review badge. A new `/admin` React route (react-router-dom) renders the operator dashboard, protected by a role stored at `/users/{uid}/role` in Realtime DB.

**Tech Stack:** React 19, Vite 7, Firebase 12 (Realtime DB + Storage + Auth), Firebase Cloud Functions v2 (Node.js 20), Sharp (thumbnails), react-router-dom 6, idb-keyval (IndexedDB queue), heic2any (HEIC→JPEG), Vitest + @testing-library/react (tests)

**Spec reference:** `docs/superpowers/specs/2026-04-08-social-media-media-upload-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/services/storage.js` | Firebase Storage upload, signed URL generation |
| Create | `src/hooks/useUploadQueue.js` | IndexedDB retry queue, background upload processing |
| Create | `src/hooks/useReviewQueue.js` | Firebase listener: count pending media reviews |
| Create | `src/components/MediaUpload.jsx` | File picker, HEIC conversion, image resize, preview |
| Create | `src/components/ReviewQueuePanel.jsx` | Mobile operator triage panel (accept/reject) |
| Create | `src/components/AdminDashboard.jsx` | Desktop `/admin` route, media review table |
| Create | `src/contexts/AdminContext.jsx` | Role reading + admin guard |
| Create | `functions/package.json` | Cloud Functions dependencies |
| Create | `functions/index.js` | Cloud Functions exports |
| Create | `functions/src/processMedia.js` | Thumbnail generation on Storage upload |
| Create | `functions/src/retentionCleanup.js` | Nightly deletion of expired DB nodes + Storage objects |
| Create | `src/test/setup.js` | Vitest + @testing-library/jest-dom setup |
| Modify | `vite.config.js` | Add Vitest test config block |
| Modify | `package.json` | Add test script, idb-keyval, heic2any, react-router-dom |
| Modify | `src/services/firebase.js` | Export `storage` instance |
| Modify | `src/components/ReportFloodPanel.jsx` | Add optional media attachment step before submit |
| Modify | `src/components/MobileHeader.jsx` | Add `reviewCount` prop + badge render |
| Modify | `src/main.jsx` | Wrap app in `<BrowserRouter>` |
| Modify | `src/App.jsx` | Add `<Route path="/admin">`, ReviewQueuePanel, review badge count |

---

## Task 1: Testing infrastructure + dependency install

**Files:**
- Modify: `vite.config.js`
- Create: `src/test/setup.js`
- Modify: `package.json` (scripts only — deps installed via npm)

- [ ] **Step 1: Install dependencies**

```bash
cd /c/Users/Acer/Documents/toby/sanBaha
npm install react-router-dom idb-keyval heic2any
npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: no errors, packages added to `node_modules/`

- [ ] **Step 2: Add Vitest config to vite.config.js**

Replace the entire file:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
```

- [ ] **Step 3: Create test setup file**

```js
// src/test/setup.js
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add test script to package.json**

In the `"scripts"` block, add:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Verify Vitest works**

```bash
npx vitest run
```

Expected: "No test files found, exiting with code 0" (no tests yet — that's fine)

- [ ] **Step 6: Commit**

```bash
git add vite.config.js src/test/setup.js package.json package-lock.json
git commit -m "feat: add Vitest + testing deps, install router and upload libs"
```

---

## Task 2: Firebase Storage initialization

**Files:**
- Modify: `src/services/firebase.js`

- [ ] **Step 1: Add Storage import and export**

In `src/services/firebase.js`, add after the existing imports:

```js
import { getStorage } from 'firebase/storage';
```

Add after `export const auth = getAuth(app);`:

```js
export const storage = getStorage(app);
```

- [ ] **Step 2: Verify no runtime errors**

```bash
npm run dev
```

Open browser. Check console — no Firebase Storage errors. The `VITE_FIREBASE_STORAGE_BUCKET` env var is already set in `.env`.

- [ ] **Step 3: Commit**

```bash
git add src/services/firebase.js
git commit -m "feat: initialize and export Firebase Storage instance"
```

---

## Task 3: Role system — AdminContext

**Files:**
- Create: `src/contexts/AdminContext.jsx`

The role `admin` or `citizen` is stored at `/users/{uid}/role` in Realtime DB. Admins are set manually via Firebase console. This context reads the role and exposes an `isAdmin` boolean.

- [ ] **Step 1: Write the failing test**

Create `src/contexts/AdminContext.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AdminProvider, useAdmin } from './AdminContext';

// Mock Firebase
vi.mock('../services/firebase', () => ({
  database: {},
  auth: { currentUser: { uid: 'test-uid' } },
  onAuthChange: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn((ref, cb) => {
    cb({ val: () => 'admin' });
    return vi.fn(); // unsubscribe
  }),
}));

function TestConsumer() {
  const { isAdmin } = useAdmin();
  return <div>{isAdmin ? 'admin' : 'citizen'}</div>;
}

describe('AdminContext', () => {
  it('exposes isAdmin true when role is admin', () => {
    render(
      <AdminProvider>
        <TestConsumer />
      </AdminProvider>
    );
    expect(screen.getByText('admin')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/contexts/AdminContext.test.jsx
```

Expected: FAIL — "Cannot find module './AdminContext'"

- [ ] **Step 3: Create AdminContext.jsx**

```jsx
// src/contexts/AdminContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database, onAuthChange } from '../services/firebase';

const AdminContext = createContext({ isAdmin: false, role: 'citizen' });

export function AdminProvider({ children }) {
  const [role, setRole] = useState('citizen');

  useEffect(() => {
    let roleUnsub = () => {};
    const authUnsub = onAuthChange((user) => {
      roleUnsub();
      if (!user) { setRole('citizen'); return; }
      const roleRef = ref(database, `users/${user.uid}/role`);
      roleUnsub = onValue(roleRef, (snap) => {
        setRole(snap.val() || 'citizen');
      });
    });
    return () => { authUnsub(); roleUnsub(); };
  }, []);

  return (
    <AdminContext.Provider value={{ isAdmin: role === 'admin', role }}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run src/contexts/AdminContext.test.jsx
```

Expected: PASS

- [ ] **Step 5: Wrap app with AdminProvider in main.jsx**

Open `src/main.jsx`. It currently looks like:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AdminProvider } from './contexts/AdminContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AdminProvider>
          <App />
        </AdminProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

Read the actual current content of `src/main.jsx` first, then apply these additions: import `BrowserRouter` from `react-router-dom`, import `AdminProvider`, wrap the tree with `<BrowserRouter>` outermost and `<AdminProvider>` inside `<AuthProvider>`.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/AdminContext.jsx src/contexts/AdminContext.test.jsx src/main.jsx
git commit -m "feat: add AdminContext with Firebase role reading"
```

---

## Task 4: Firebase Storage upload service

**Files:**
- Create: `src/services/storage.js`
- Create: `src/services/storage.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/services/storage.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
  ref: vi.fn((_, path) => ({ path })),
  uploadBytesResumable: vi.fn(() => {
    const listeners = {};
    return {
      on: (event, progress, error, complete) => {
        listeners.complete = complete;
        // simulate immediate success
        setTimeout(() => complete(), 0);
      },
      snapshot: { ref: { _path: 'uploads/test-id/original.jpg' } },
    };
  }),
  getDownloadURL: vi.fn(() => Promise.resolve('https://storage.example.com/test.jpg')),
}));

vi.mock('../services/firebase', () => ({ app: {}, storage: {} }));

describe('uploadMedia', () => {
  it('resolves with storagePath and downloadURL on success', async () => {
    const { uploadMedia } = await import('./storage.js');
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await uploadMedia('report-123', file);
    expect(result.storagePath).toBe('uploads/report-123/original.jpg');
    expect(result.downloadURL).toBe('https://storage.example.com/test.jpg');
    expect(result.isVideo).toBe(false);
  });

  it('correctly identifies video files', async () => {
    const { uploadMedia } = await import('./storage.js');
    const file = new File(['data'], 'clip.mp4', { type: 'video/mp4' });
    const result = await uploadMedia('report-456', file);
    expect(result.storagePath).toBe('uploads/report-456/original.mp4');
    expect(result.isVideo).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/services/storage.test.js
```

Expected: FAIL — "Cannot find module './storage.js'"

- [ ] **Step 3: Create storage.js**

```js
// src/services/storage.js
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export const uploadMedia = (reportId, file, onProgress) => {
  const isVideo = file.type.startsWith('video/');
  const ext = isVideo
    ? (file.name.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4')
    : 'jpg';
  const storagePath = `uploads/${reportId}/original.${ext}`;
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes),
      reject,
      async () => {
        const downloadURL = await getDownloadURL(task.snapshot.ref);
        resolve({ storagePath, downloadURL, isVideo });
      }
    );
  });
};
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run src/services/storage.test.js
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/storage.js src/services/storage.test.js
git commit -m "feat: add Firebase Storage upload service with video support"
```

---

## Task 5: Upload retry queue (IndexedDB)

**Files:**
- Create: `src/hooks/useUploadQueue.js`
- Create: `src/hooks/useUploadQueue.test.js`

Uses `idb-keyval` to persist file blobs across page refreshes. Retries on app launch and `online` events. Max 5 attempts per item.

- [ ] **Step 1: Write the failing test**

```js
// src/hooks/useUploadQueue.test.js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('idb-keyval', () => ({
  get: vi.fn(() => Promise.resolve([])),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
}));

vi.mock('../services/storage', () => ({
  uploadMedia: vi.fn(() => Promise.resolve({
    storagePath: 'uploads/test/original.jpg',
    downloadURL: 'https://example.com/test.jpg',
    isVideo: false,
  })),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  update: vi.fn(() => Promise.resolve()),
}));

vi.mock('../services/firebase', () => ({ database: {} }));

describe('useUploadQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enqueue adds item to the queue', async () => {
    const { useUploadQueue } = await import('./useUploadQueue.js');
    const { result } = renderHook(() => useUploadQueue());
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.enqueue('report-1', file);
    });

    const { set } = await import('idb-keyval');
    expect(set).toHaveBeenCalled();
  });

  it('processQueue removes item after successful upload', async () => {
    const { get, del } = await import('idb-keyval');
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    get.mockResolvedValueOnce([
      { reportId: 'r1', file, retryCount: 0, fileType: 'image/jpeg', fileName: 'photo.jpg' }
    ]);

    const { useUploadQueue } = await import('./useUploadQueue.js');
    const { result } = renderHook(() => useUploadQueue());

    await act(async () => {
      await result.current.processQueue();
    });

    expect(del).toHaveBeenCalledWith('r1');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/hooks/useUploadQueue.test.js
```

Expected: FAIL — "Cannot find module './useUploadQueue.js'"

- [ ] **Step 3: Create useUploadQueue.js**

```js
// src/hooks/useUploadQueue.js
import { useCallback, useEffect } from 'react';
import { get, set, del } from 'idb-keyval';
import { ref, update } from 'firebase/database';
import { uploadMedia } from '../services/storage';
import { database } from '../services/firebase';

const QUEUE_KEY = 'sanbaha_upload_queue';
const MAX_RETRIES = 5;

export const useUploadQueue = () => {
  const enqueue = useCallback(async (reportId, file) => {
    const existing = (await get(QUEUE_KEY)) || [];
    const next = [
      ...existing.filter((i) => i.reportId !== reportId),
      { reportId, file, fileName: file.name, fileType: file.type, retryCount: 0, lastAttempt: null },
    ];
    await set(QUEUE_KEY, next);
  }, []);

  const processQueue = useCallback(async () => {
    const queue = (await get(QUEUE_KEY)) || [];
    if (queue.length === 0) return;

    for (const item of queue) {
      if (item.retryCount >= MAX_RETRIES) continue;
      try {
        const file = item.file instanceof File
          ? item.file
          : new File([item.file], item.fileName, { type: item.fileType });

        const { storagePath, downloadURL, isVideo } = await uploadMedia(item.reportId, file);

        await update(ref(database, `media_uploads/${item.reportId}`), {
          originalPath: storagePath,
          downloadURL,
          isVideo,
          uploadedAt: new Date().toISOString(),
          processingStatus: 'pending',
        });

        await del(item.reportId);

        const refreshed = (await get(QUEUE_KEY)) || [];
        await set(QUEUE_KEY, refreshed.filter((i) => i.reportId !== item.reportId));
      } catch {
        const refreshed = (await get(QUEUE_KEY)) || [];
        await set(
          QUEUE_KEY,
          refreshed.map((i) =>
            i.reportId === item.reportId
              ? { ...i, retryCount: i.retryCount + 1, lastAttempt: new Date().toISOString() }
              : i
          )
        );
      }
    }
  }, []);

  useEffect(() => {
    processQueue();
    window.addEventListener('online', processQueue);
    return () => window.removeEventListener('online', processQueue);
  }, [processQueue]);

  return { enqueue, processQueue };
};
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run src/hooks/useUploadQueue.test.js
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUploadQueue.js src/hooks/useUploadQueue.test.js
git commit -m "feat: add IndexedDB upload retry queue with auto-retry on reconnect"
```

---

## Task 6: MediaUpload component

**Files:**
- Create: `src/components/MediaUpload.jsx`

Handles file picking, HEIC→JPEG conversion, client-side image resize to 2048px max, and video pass-through. Shows a thumbnail preview with a remove button.

- [ ] **Step 1: Create MediaUpload.jsx**

```jsx
// src/components/MediaUpload.jsx
import { useRef, useState } from 'react';

async function convertHeic(file) {
  const heic2any = (await import('heic2any')).default;
  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  return new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
}

async function resizeImage(file, maxPx = 2048) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      if (scale === 1) { resolve(file); return; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })),
        'image/jpeg', 0.85
      );
    };
    img.src = url;
  });
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime';

export default function MediaUpload({ onChange, disabled }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setProcessing(true);

    try {
      const isVideo = file.type.startsWith('video/');
      const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

      if (file.size > limit) {
        setError(`File too large. Max ${isVideo ? '50 MB' : '10 MB'}.`);
        setProcessing(false);
        return;
      }

      let processed = file;
      if (!isVideo) {
        if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
          processed = await convertHeic(file);
        }
        processed = await resizeImage(processed);
      }

      const previewUrl = URL.createObjectURL(processed);
      setPreview({ url: previewUrl, isVideo });
      onChange(processed);
    } catch {
      setError('Could not process file. Please try another.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
        disabled={disabled || processing}
      />

      {!preview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || processing}
          className="w-full p-3 rounded-xl border border-dashed border-[#00d4ff]/30 text-slate-400 text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {processing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Add Photo / Video (optional)
            </>
          )}
        </button>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-[#162d4d]">
          {preview.isVideo ? (
            <div className="w-full h-32 flex items-center justify-center bg-[#0a1628]">
              <svg className="w-10 h-10 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="ml-2 text-sm text-slate-300">Video attached</span>
            </div>
          ) : (
            <img src={preview.url} alt="preview" className="w-full h-32 object-cover" />
          )}
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white text-xs font-bold"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-[10px] text-red-400">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Smoke test in dev**

```bash
npm run dev
```

Open the app. Tap "Report Flood" — the component isn't wired yet, but the import chain should load without errors. Check console.

- [ ] **Step 3: Commit**

```bash
git add src/components/MediaUpload.jsx
git commit -m "feat: add MediaUpload component with HEIC conversion and resize"
```

---

## Task 7: Extend ReportFloodPanel with media attachment

**Files:**
- Modify: `src/components/ReportFloodPanel.jsx`
- Modify: `src/App.jsx` (update handleReportSubmit signature)

The media file is passed to `onSubmit` alongside the existing report object. App.jsx's `handleReportSubmit` enqueues the upload separately after saving the text report.

- [ ] **Step 1: Write consent check in firebase.js**

Add to `src/services/firebase.js`:

```js
import { ref as dbRef, set as dbSet, get } from 'firebase/database';

export const hasMediaConsent = async (uid) => {
  const snap = await get(dbRef(database, `users/${uid}/mediaConsentGiven`));
  return snap.val() === true;
};

export const setMediaConsent = (uid) =>
  dbSet(dbRef(database, `users/${uid}/mediaConsentGiven`), true);
```

- [ ] **Step 2: Add media attachment to ReportFloodPanel**

Replace the `Description` section and everything after it (lines 181–237) in `src/components/ReportFloodPanel.jsx` with the updated version below. Also add `mediaFile` state and the `MediaUpload` import:

At the top of `ReportFloodPanel.jsx`, add these imports:
```jsx
import MediaUpload from './MediaUpload';
import { hasMediaConsent, setMediaConsent } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
```

Add state inside the component after the existing state declarations:
```jsx
const { user } = useAuth();
const [mediaFile, setMediaFile] = useState(null);
const [showConsentPrompt, setShowConsentPrompt] = useState(false);
```

Replace `handleSubmit` with:
```jsx
const handleSubmit = async () => {
  if (!userLocation) {
    if (onError) onError('Unable to get your location. Please enable GPS.');
    return;
  }

  // Consent check for media
  if (mediaFile && user) {
    const consented = await hasMediaConsent(user.uid);
    if (!consented) {
      setShowConsentPrompt(true);
      return;
    }
  }

  setIsSubmitting(true);

  const report = {
    id: `crowd-${Date.now()}`,
    type: 'crowdsourced',
    coordinates: [userLocation[1], userLocation[0]],
    severity,
    description: description || getSeverityLabel(severity),
    locationName: locationName || 'Unknown Location',
    reportedAt: new Date().toISOString(),
    reporterId: user?.uid || 'anonymous',
    upvotes: 0,
    verified: false,
  };

  onSubmit(report, mediaFile); // pass mediaFile as second arg
  setIsSubmitting(false);
  setShowSuccess(true);

  setTimeout(() => {
    setShowSuccess(false);
    onClose();
    setSeverity('warning');
    setDescription('');
    setMediaFile(null);
  }, 2000);
};
```

Add the consent prompt and MediaUpload inside the form (after the Description block, before the Submit button):

```jsx
{/* Media Attachment */}
<div className="mb-4">
  <label className="block text-[10px] text-slate-400 mb-2 uppercase tracking-wider">
    Photo / Video
  </label>
  <MediaUpload onChange={setMediaFile} disabled={isSubmitting} />
</div>

{/* Consent Prompt Modal */}
{showConsentPrompt && (
  <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6">
    <div className="absolute inset-0 bg-black/80" onClick={() => setShowConsentPrompt(false)} />
    <div className="relative glass-card rounded-2xl p-5 max-w-xs">
      <p className="text-sm text-white mb-3">
        Your photo/video, name, and location will be stored by sanBaha and visible to authorized emergency responders. It will not be shared publicly.
      </p>
      <div className="flex gap-2">
        <button
          className="flex-1 py-2 rounded-lg bg-[#162d4d] text-slate-300 text-sm"
          onClick={() => setShowConsentPrompt(false)}
        >
          Cancel
        </button>
        <button
          className="flex-1 py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a1628] text-sm font-semibold"
          onClick={async () => {
            await setMediaConsent(user.uid);
            setShowConsentPrompt(false);
            handleSubmit();
          }}
        >
          I Agree
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Update handleReportSubmit in App.jsx to accept mediaFile**

In `src/App.jsx`, update the `handleReportSubmit` function to accept and enqueue the media:

```jsx
// Add at top of App.jsx
import { useUploadQueue } from './hooks/useUploadQueue';

// Inside App(), add:
const { enqueue: enqueueUpload } = useUploadQueue();

// Update handleReportSubmit:
const handleReportSubmit = async (report, mediaFile) => {
  try {
    await submitFloodReport(report);
  } catch (_) {
    setToast({ message: 'Failed to save report. Please try again.', type: 'error' });
    return;
  }

  // Write /media_uploads metadata immediately; storage.js fills in paths after upload
  if (mediaFile && user) {
    const { ref: dbRef, set: dbSet } = await import('firebase/database');
    const { database } = await import('./services/firebase');
    await dbSet(dbRef(database, `media_uploads/${report.id}`), {
      reportId: report.id,
      uploaderId: user.uid,
      uploaderName: user.displayName || 'Anonymous',
      type: mediaFile.type.startsWith('video/') ? 'video' : 'photo',
      fileSize: mediaFile.size,
      coordinates: report.coordinates,
      capturedAt: new Date().toISOString(),
      uploadedAt: null,
      processingStatus: 'queued',
    });
    await enqueueUpload(report.id, mediaFile);
  }

  setCrowdsourcedReports(prev => [...prev, report]);
  setToast({ message: 'Flood report submitted!', type: 'success' });

  if (report.severity === 'warning' || report.severity === 'flooded') {
    const newHotspot = {
      id: report.id,
      name: report.locationName.split(',')[0] || 'User Report',
      location: report.locationName,
      coordinates: report.coordinates,
      waterLevel: report.severity === 'flooded' ? 80 : 50,
      status: report.severity,
      lastUpdate: report.reportedAt,
      type: 'crowdsourced',
      verified: false,
    };
    setHotspots(prev => [...prev, newHotspot]);
  }
};
```

Note: The dynamic imports for `firebase/database` inside the function are a workaround to keep the import at the top clean. Alternatively, add `ref as dbRef, set as dbSet` to the existing `import { ... } from 'firebase/database'` block at the top of `App.jsx` if it exists, or add a new static import.

- [ ] **Step 4: Verify in dev**

```bash
npm run dev
```

Open app → Report Flood → media picker appears. Select a photo → preview shows. Submit → text report saves, upload begins in background. Check Firebase console: `/crowd_reports` has new entry, `/media_uploads/{id}` has entry with `processingStatus: "queued"`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportFloodPanel.jsx src/services/firebase.js src/App.jsx src/hooks/useUploadQueue.js
git commit -m "feat: add media attachment to flood reports with consent gate and retry queue"
```

---

## Task 8: Cloud Functions — setup + process-media

**Files:**
- Create: `functions/package.json`
- Create: `functions/index.js`
- Create: `functions/src/processMedia.js`

Generates a 400px thumbnail for images and extracts the first video frame when a file lands in Firebase Storage under `uploads/`.

- [ ] **Step 1: Initialize Cloud Functions project**

```bash
cd /c/Users/Acer/Documents/toby/sanBaha
npx firebase init functions
```

When prompted:
- Use existing project → select `sanbaha-e05ae`
- Language: JavaScript
- ESLint: No
- Install dependencies: Yes

This creates `functions/package.json` and `functions/index.js`.

- [ ] **Step 2: Install processing libraries**

```bash
cd functions
npm install sharp @ffmpeg-installer/ffmpeg fluent-ffmpeg firebase-admin
```

- [ ] **Step 3: Create functions/src/processMedia.js**

```js
// functions/src/processMedia.js
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const admin = require('firebase-admin');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const os = require('os');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

const THUMB_WIDTH = 400;

exports.processMedia = onObjectFinalized(
  { region: 'asia-southeast1', memory: '512MiB' },
  async (event) => {
    const filePath = event.data.name; // e.g. uploads/report-123/original.jpg
    const contentType = event.data.contentType;

    // Only process originals under uploads/
    if (!filePath.startsWith('uploads/') || !filePath.includes('/original.')) return;

    const bucket = admin.storage().bucket(event.data.bucket);
    const reportId = filePath.split('/')[1];
    const db = admin.database();

    if (contentType.startsWith('image/')) {
      await processImage(bucket, filePath, reportId, db);
    } else if (contentType.startsWith('video/')) {
      await processVideo(bucket, filePath, reportId, db);
    }
  }
);

async function processImage(bucket, filePath, reportId, db) {
  const tmpInput = path.join(os.tmpdir(), `original-${reportId}.jpg`);
  const tmpThumb = path.join(os.tmpdir(), `thumb-${reportId}.jpg`);

  await bucket.file(filePath).download({ destination: tmpInput });

  await sharp(tmpInput)
    .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(tmpThumb);

  const thumbDest = `uploads/${reportId}/thumb_400.jpg`;
  await bucket.upload(tmpThumb, {
    destination: thumbDest,
    metadata: { contentType: 'image/jpeg' },
  });

  await db.ref(`media_uploads/${reportId}`).update({
    thumbPath: thumbDest,
    processingStatus: 'complete',
  });

  fs.unlinkSync(tmpInput);
  fs.unlinkSync(tmpThumb);
}

async function processVideo(bucket, filePath, reportId, db) {
  const tmpInput = path.join(os.tmpdir(), `video-${reportId}.mp4`);
  const tmpFrame = path.join(os.tmpdir(), `frame-${reportId}.jpg`);

  await bucket.file(filePath).download({ destination: tmpInput });

  await new Promise((resolve, reject) => {
    ffmpeg(tmpInput)
      .screenshots({ count: 1, filename: path.basename(tmpFrame), folder: os.tmpdir() })
      .on('end', resolve)
      .on('error', reject);
  });

  const frameDest = `uploads/${reportId}/thumb_video.jpg`;
  await bucket.upload(tmpFrame, {
    destination: frameDest,
    metadata: { contentType: 'image/jpeg' },
  });

  await db.ref(`media_uploads/${reportId}`).update({
    thumbPath: frameDest,
    processingStatus: 'complete',
  });

  if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
  if (fs.existsSync(tmpFrame)) fs.unlinkSync(tmpFrame);
}
```

- [ ] **Step 4: Wire into functions/index.js**

Replace the generated `functions/index.js` with:

```js
const admin = require('firebase-admin');
admin.initializeApp();

const { processMedia } = require('./src/processMedia');
const { retentionCleanup } = require('./src/retentionCleanup');

exports.processMedia = processMedia;
exports.retentionCleanup = retentionCleanup;
```

(Note: `retentionCleanup` will be created in Task 9 — add its require now to avoid a deploy error later, or add it after Task 9.)

- [ ] **Step 5: Deploy processMedia**

```bash
cd functions
npx firebase deploy --only functions:processMedia
```

Expected: "Deploy complete! Project Console: https://console.firebase.google.com/..."

- [ ] **Step 6: Integration test**

Using Firebase console Storage browser: manually upload a JPEG to `uploads/test-manual/original.jpg`. Wait ~30 seconds. Check:
- `uploads/test-manual/thumb_400.jpg` exists in Storage
- Firebase Realtime DB: `/media_uploads/test-manual` has `processingStatus: "complete"` and `thumbPath`

- [ ] **Step 7: Commit**

```bash
cd ..
git add functions/
git commit -m "feat: add process-media Cloud Function for thumbnail generation"
```

---

## Task 9: Cloud Function — retention cleanup

**Files:**
- Create: `functions/src/retentionCleanup.js`

Runs nightly. Deletes `/crowd_reports`, `/media_uploads` entries older than 90 days. Deletes `/social_intake` rejected entries older than 30 days. Deletes corresponding Storage objects.

- [ ] **Step 1: Create functions/src/retentionCleanup.js**

```js
// functions/src/retentionCleanup.js
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

exports.retentionCleanup = onSchedule(
  { schedule: 'every day 02:00', region: 'asia-southeast1', timeZone: 'Asia/Manila' },
  async () => {
    const db = admin.database();
    const bucket = admin.storage().bucket();
    const now = Date.now();

    // Delete crowd_reports + media_uploads older than 90 days
    const reportsSnap = await db.ref('crowd_reports').once('value');
    const reports = reportsSnap.val() || {};
    for (const [key, report] of Object.entries(reports)) {
      const age = now - new Date(report.reportedAt || report.submittedAt || 0).getTime();
      if (age > NINETY_DAYS_MS) {
        await db.ref(`crowd_reports/${key}`).remove();
        await db.ref(`media_uploads/${key}`).remove();
        // Delete Storage folder
        try {
          const [files] = await bucket.getFiles({ prefix: `uploads/${key}/` });
          await Promise.all(files.map((f) => f.delete()));
        } catch { /* folder may not exist */ }
      }
    }

    // Delete rejected social_intake older than 30 days
    const intakeSnap = await db.ref('social_intake').once('value');
    const intake = intakeSnap.val() || {};
    for (const [key, post] of Object.entries(intake)) {
      if (post.status !== 'rejected') continue;
      const age = now - new Date(post.ingestedAt || 0).getTime();
      if (age > THIRTY_DAYS_MS) {
        await db.ref(`social_intake/${key}`).remove();
      }
    }

    // Delete accepted social_intake (promoted to crowd_reports) older than 90 days
    for (const [key, post] of Object.entries(intake)) {
      if (post.status !== 'accepted') continue;
      const age = now - new Date(post.ingestedAt || 0).getTime();
      if (age > NINETY_DAYS_MS) {
        await db.ref(`social_intake/${key}`).remove();
      }
    }

    console.log('Retention cleanup complete.');
  }
);
```

- [ ] **Step 2: Update functions/index.js to export retentionCleanup**

Ensure `functions/index.js` includes:

```js
const { retentionCleanup } = require('./src/retentionCleanup');
exports.retentionCleanup = retentionCleanup;
```

(If you already added the require in Task 8 Step 4, this is already done.)

- [ ] **Step 3: Deploy**

```bash
cd functions
npx firebase deploy --only functions:retentionCleanup
```

Expected: Deploy complete.

- [ ] **Step 4: Commit**

```bash
cd ..
git add functions/src/retentionCleanup.js functions/index.js
git commit -m "feat: add nightly retention-cleanup Cloud Function"
```

---

## Task 10: Review queue hook + MobileHeader badge

**Files:**
- Create: `src/hooks/useReviewQueue.js`
- Modify: `src/components/MobileHeader.jsx`

- [ ] **Step 1: Write failing test for useReviewQueue**

```js
// src/hooks/useReviewQueue.test.js
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  query: vi.fn((_r, ..._mods) => ({})),
  orderByChild: vi.fn(() => 'orderByChild'),
  equalTo: vi.fn(() => 'equalTo'),
  onValue: vi.fn((ref, cb) => {
    cb({ val: () => ({ a: {}, b: {}, c: {} }) }); // 3 pending
    return vi.fn();
  }),
}));

vi.mock('../services/firebase', () => ({ database: {} }));

describe('useReviewQueue', () => {
  it('returns count of pending media_uploads', async () => {
    const { useReviewQueue } = await import('./useReviewQueue.js');
    const { result } = renderHook(() => useReviewQueue());
    expect(result.current.pendingCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/hooks/useReviewQueue.test.js
```

Expected: FAIL

- [ ] **Step 3: Create useReviewQueue.js**

```js
// src/hooks/useReviewQueue.js
import { useEffect, useState } from 'react';
import { ref, query, orderByChild, equalTo, onValue } from 'firebase/database';
import { database } from '../services/firebase';

export const useReviewQueue = () => {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const mediaRef = query(
      ref(database, 'media_uploads'),
      orderByChild('processingStatus'),
      equalTo('complete')
    );

    const unsub = onValue(mediaRef, (snap) => {
      const data = snap.val();
      // Count uploads where mediaVerified is not yet true
      const unreviewed = data
        ? Object.values(data).filter((u) => !u.mediaVerified).length
        : 0;
      setPendingCount(unreviewed);
    });

    return () => unsub();
  }, []);

  return { pendingCount };
};
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run src/hooks/useReviewQueue.test.js
```

Expected: PASS

- [ ] **Step 5: Add badge to MobileHeader**

In `src/components/MobileHeader.jsx`, update the component signature to accept `reviewCount`:

```jsx
const MobileHeader = ({ lastUpdate, onMenuClick, onNavigateClick, reviewCount = 0 }) => {
```

Update the Menu Button to show the badge when `reviewCount > 0`:

```jsx
{/* Menu Button */}
<button
  onClick={onMenuClick}
  className="relative w-9 h-9 rounded-xl bg-[#162d4d] flex items-center justify-center text-slate-300 active:scale-95 transition-transform"
>
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
  {reviewCount > 0 && (
    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] text-white font-bold">
      {reviewCount > 9 ? '9+' : reviewCount}
    </span>
  )}
</button>
```

- [ ] **Step 6: Wire reviewCount in App.jsx**

In `src/App.jsx`:

```jsx
// Add import
import { useReviewQueue } from './hooks/useReviewQueue';
import { useAdmin } from './contexts/AdminContext';

// Inside App(), add:
const { isAdmin } = useAdmin();
const { pendingCount } = useReviewQueue();

// Update MobileHeader usage:
<MobileHeader
  lastUpdate={lastUpdate}
  onMenuClick={() => setIsMobileMenuOpen(true)}
  onNavigateClick={handleOpenNavigation}
  reviewCount={isAdmin ? pendingCount : 0}
/>
```

- [ ] **Step 7: Verify in dev**

```bash
npm run dev
```

Sign in with a Google account that has `admin` role in Firebase DB (`/users/{uid}/role = "admin"`). Header menu button should show a badge if any `media_uploads` entries have `processingStatus: "complete"` and no `mediaVerified`.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useReviewQueue.js src/hooks/useReviewQueue.test.js src/components/MobileHeader.jsx src/App.jsx
git commit -m "feat: add review queue count hook and admin badge on header"
```

---

## Task 11: ReviewQueuePanel — mobile operator triage

**Files:**
- Create: `src/components/ReviewQueuePanel.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create ReviewQueuePanel.jsx**

```jsx
// src/components/ReviewQueuePanel.jsx
import { useState, useEffect } from 'react';
import { ref, query, orderByChild, equalTo, onValue, update } from 'firebase/database';
import { database } from '../services/firebase';

function MediaCard({ item, itemId, onAccept, onReject }) {
  return (
    <div className="p-3 bg-[#162d4d] rounded-xl space-y-2">
      {/* Thumbnail */}
      {item.thumbPath ? (
        <div className="w-full h-24 rounded-lg overflow-hidden bg-[#0a1628]">
          <img
            src={`https://firebasestorage.googleapis.com/v0/b/${item.storageBucket}/o/${encodeURIComponent(item.thumbPath)}?alt=media`}
            alt="Report media"
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-full h-16 rounded-lg bg-[#0a1628] flex items-center justify-center">
          <span className="text-[10px] text-slate-500">Processing thumbnail...</span>
        </div>
      )}

      {/* Meta */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-white font-medium">{item.uploaderName || 'Citizen'}</p>
          <p className="text-[10px] text-slate-400">
            {item.type === 'video' ? 'Video' : 'Photo'} •{' '}
            {item.uploadedAt ? new Date(item.uploadedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Uploading...'}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onReject(itemId)}
            className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-semibold active:scale-95 transition-transform"
          >
            Reject
          </button>
          <button
            onClick={() => onAccept(itemId)}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold active:scale-95 transition-transform"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewQueuePanel({ isOpen, onClose }) {
  const [items, setItems] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const q = query(
      ref(database, 'media_uploads'),
      orderByChild('processingStatus'),
      equalTo('complete')
    );
    const unsub = onValue(q, (snap) => {
      const data = snap.val() || {};
      const unreviewed = Object.fromEntries(
        Object.entries(data).filter(([, v]) => !v.mediaVerified)
      );
      setItems(unreviewed);
    });
    return () => unsub();
  }, [isOpen]);

  const handleAccept = async (id) => {
    await update(ref(database, `crowd_reports/${id}`), { mediaVerified: true });
    await update(ref(database, `media_uploads/${id}`), { mediaVerified: true });
  };

  const handleReject = async (id) => {
    await update(ref(database, `media_uploads/${id}`), { mediaVerified: false, rejected: true });
  };

  if (!isOpen) return null;

  const entries = Object.entries(items);

  return (
    <div className="absolute inset-0 z-[2000] flex">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm ml-auto h-full glass-card flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-[#00d4ff]/10 flex items-center justify-between">
          <h2 className="font-bold text-white">Review Queue</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {entries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-slate-500 text-sm">No pending reviews</p>
            </div>
          ) : (
            entries.map(([id, item]) => (
              <MediaCard key={id} item={item} itemId={id} onAccept={handleAccept} onReject={handleReject} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add ReviewQueuePanel to App.jsx**

In `src/App.jsx`:

```jsx
// Add import
import ReviewQueuePanel from './components/ReviewQueuePanel';

// Add state
const [showReviewQueue, setShowReviewQueue] = useState(false);

// Add to the menu's "Review Queue" item (add this button at the top of the menu items div):
{isAdmin && pendingCount > 0 && (
  <button
    onClick={() => {
      setIsMobileMenuOpen(false);
      setShowReviewQueue(true);
    }}
    className="w-full p-3 rounded-xl bg-gradient-to-r from-red-500/20 to-amber-500/20 border border-red-500/30 text-left text-white flex items-center justify-between active:scale-[0.98] transition-transform text-sm"
  >
    <div className="flex items-center gap-3">
      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      Review Queue
    </div>
    <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[9px] text-white font-bold">
      {pendingCount > 9 ? '9+' : pendingCount}
    </span>
  </button>
)}

// Add ReviewQueuePanel to the JSX (after LoginPrompt):
<ReviewQueuePanel isOpen={showReviewQueue} onClose={() => setShowReviewQueue(false)} />
```

- [ ] **Step 3: Verify in dev**

Sign in as admin. Submit a report with a photo. After Cloud Function processes the thumbnail (30s), the badge appears. Open menu → "Review Queue" → card shows with Accept/Reject. Accept → `crowd_reports/{id}/mediaVerified: true` in Firebase.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReviewQueuePanel.jsx src/App.jsx
git commit -m "feat: add mobile operator review queue panel for media triage"
```

---

## Task 12: AdminDashboard — desktop `/admin` route

**Files:**
- Create: `src/components/AdminDashboard.jsx`
- Modify: `src/App.jsx`

The dashboard shows all `media_uploads` with `processingStatus: "complete"` in a sortable list, with accept/reject actions and a link to the full image (signed URL via Firebase Storage's `getDownloadURL`).

- [ ] **Step 1: Create AdminDashboard.jsx**

```jsx
// src/components/AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { database, storage } from '../services/firebase';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

function MediaRow({ id, item, onAccept, onReject }) {
  const [thumbUrl, setThumbUrl] = useState(null);

  useEffect(() => {
    if (!item.thumbPath) return;
    getDownloadURL(storageRef(storage, item.thumbPath))
      .then(setThumbUrl)
      .catch(() => {});
  }, [item.thumbPath]);

  const timeStr = item.uploadedAt
    ? new Date(item.uploadedAt).toLocaleString('en-PH')
    : 'Pending upload';

  const coords = Array.isArray(item.coordinates)
    ? `${item.coordinates[0].toFixed(4)}, ${item.coordinates[1].toFixed(4)}`
    : '—';

  return (
    <tr className="border-b border-[#162d4d] hover:bg-[#162d4d]/30 transition-colors">
      <td className="p-3">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-16 h-12 object-cover rounded-lg" />
        ) : (
          <div className="w-16 h-12 rounded-lg bg-[#162d4d] flex items-center justify-center">
            <span className="text-[9px] text-slate-500">{item.processingStatus}</span>
          </div>
        )}
      </td>
      <td className="p-3">
        <p className="text-sm text-white">{item.uploaderName || '—'}</p>
        <p className="text-[10px] text-slate-400">{item.type}</p>
      </td>
      <td className="p-3 text-[10px] text-slate-400">{coords}</td>
      <td className="p-3 text-[10px] text-slate-400">{timeStr}</td>
      <td className="p-3">
        {item.mediaVerified === true ? (
          <span className="text-[10px] text-emerald-400 font-medium">Accepted</span>
        ) : item.rejected ? (
          <span className="text-[10px] text-red-400 font-medium">Rejected</span>
        ) : (
          <div className="flex gap-1.5">
            <button
              onClick={() => onReject(id)}
              className="px-2 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-semibold"
            >
              Reject
            </button>
            <button
              onClick={() => onAccept(id)}
              className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold"
            >
              Accept
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function AdminDashboard() {
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const [uploads, setUploads] = useState({});
  const [floodActive, setFloodActive] = useState(false);

  useEffect(() => {
    const unsub1 = onValue(ref(database, 'media_uploads'), (snap) => {
      setUploads(snap.val() || {});
    });
    const unsub2 = onValue(ref(database, 'system/floodActive'), (snap) => {
      setFloodActive(snap.val() === true);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  if (!user) return <Navigate to="/" />;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
      <p className="text-slate-400">Access denied. Admin role required.</p>
    </div>
  );

  const handleAccept = async (id) => {
    await update(ref(database, `crowd_reports/${id}`), { mediaVerified: true });
    await update(ref(database, `media_uploads/${id}`), { mediaVerified: true });
  };

  const handleReject = async (id) => {
    await update(ref(database, `media_uploads/${id}`), { mediaVerified: false, rejected: true });
  };

  const pending = Object.entries(uploads).filter(([, v]) => v.processingStatus === 'complete' && !v.mediaVerified && !v.rejected);
  const reviewed = Object.entries(uploads).filter(([, v]) => v.mediaVerified || v.rejected);

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      {/* Top bar */}
      <div className="glass border-b border-[#00d4ff]/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold gradient-text">sanBaha Admin</h1>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${floodActive ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
            {floodActive ? 'ACTIVE FLOOD' : 'Normal'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{user.displayName}</span>
          <a href="/" className="text-[10px] text-[#00d4ff]">← Back to map</a>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Pending Review */}
        <section>
          <h2 className="text-base font-bold text-white mb-4">
            Intake Queue <span className="text-slate-400 text-sm font-normal">({pending.length} pending)</span>
          </h2>
          {pending.length === 0 ? (
            <p className="text-slate-500 text-sm">No items pending review.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#162d4d]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#162d4d] text-[10px] text-slate-400 uppercase tracking-wider">
                    <th className="p-3">Preview</th>
                    <th className="p-3">Uploader</th>
                    <th className="p-3">Coordinates</th>
                    <th className="p-3">Uploaded</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(([id, item]) => (
                    <MediaRow key={id} id={id} item={item} onAccept={handleAccept} onReject={handleReject} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Reviewed */}
        <section>
          <h2 className="text-base font-bold text-white mb-4">
            Reviewed <span className="text-slate-400 text-sm font-normal">({reviewed.length} total)</span>
          </h2>
          {reviewed.length === 0 ? (
            <p className="text-slate-500 text-sm">No reviewed items yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#162d4d]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#162d4d] text-[10px] text-slate-400 uppercase tracking-wider">
                    <th className="p-3">Preview</th>
                    <th className="p-3">Uploader</th>
                    <th className="p-3">Coordinates</th>
                    <th className="p-3">Uploaded</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewed.map(([id, item]) => (
                    <MediaRow key={id} id={id} item={item} onAccept={handleAccept} onReject={handleReject} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add /admin route to App.jsx**

In `src/App.jsx`, wrap the existing return in React Router. Read the current `src/main.jsx` to confirm `BrowserRouter` is already added (Task 3 Step 5).

Add imports to `src/App.jsx`:

```jsx
import { Routes, Route } from 'react-router-dom';
import AdminDashboard from './components/AdminDashboard';
```

Wrap the entire return content in a `<Routes>` block:

```jsx
return (
  <Routes>
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/*" element={
      <div className="h-full w-full bg-[#0a1628] overflow-hidden relative">
        {/* ALL EXISTING JSX GOES HERE — portal div, MobileHeader, Map, panels etc. */}
      </div>
    } />
  </Routes>
);
```

Wrap all existing content inside the `path="/*"` Route element exactly as it is now — no changes to any existing component.

- [ ] **Step 3: Verify in dev**

```bash
npm run dev
```

Navigate to `http://localhost:5173/admin`. With an admin-role user signed in, you should see the AdminDashboard. Without admin role, see "Access denied". Navigate back to `/` — full map app works unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminDashboard.jsx src/App.jsx src/main.jsx
git commit -m "feat: add /admin route with desktop operator dashboard for media review"
```

---

## Task 13: Database security rules

**Files:**
- Create: `database.rules.json`

Locks down the new nodes so only authenticated users can read crowd_reports and only admins can read social_intake.

- [ ] **Step 1: Create database.rules.json**

```json
{
  "rules": {
    "flood_sensors": {
      ".read": true,
      ".write": false
    },
    "crowd_reports": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "media_uploads": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "social_intake": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": false
    },
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "$uid === auth.uid"
      }
    },
    "system": {
      ".read": true,
      ".write": false
    },
    "logs": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": false
    }
  }
}
```

- [ ] **Step 2: Deploy rules**

```bash
npx firebase deploy --only database
```

Expected: "Deploy complete!"

- [ ] **Step 3: Verify rule enforcement**

In browser, sign out. Open devtools → confirm that reading `/crowd_reports` now returns a permission error (unauthenticated access blocked). Sign in → data loads.

- [ ] **Step 4: Commit**

```bash
git add database.rules.json
git commit -m "feat: add Firebase Realtime Database security rules for new nodes"
```

---

## Final Verification Checklist

- [ ] Submit a flood report without media — text saves to Firebase, map hotspot appears immediately
- [ ] Submit a report with a photo — photo picker opens, preview renders, submit proceeds, upload happens in background
- [ ] Submit a report with HEIC photo (iPhone) — converts to JPEG silently
- [ ] Submit a report on a slow connection — text report succeeds, media queued locally, retry fires on reconnect
- [ ] Sign in as admin, navigate to `/admin` — AdminDashboard renders with uploaded media table
- [ ] Accept a media upload in dashboard — `mediaVerified: true` written to both nodes
- [ ] Sign in as non-admin user, navigate to `/admin` — "Access denied" shown
- [ ] Menu badge shows count when pending uploads exist (admin only)
- [ ] Open Review Queue panel on mobile — cards render, accept/reject work
- [ ] Thumbnail appears in both dashboard and mobile queue ~30s after upload (Cloud Function)

---

## Plan 2 Preview — Social Media Ingestion

Plan 2 covers: `flood-state-monitor` Cloud Function, `fb-scraper` Cloud Function with confidence scoring, `/social_intake` DB node, and adding social post cards to the AdminDashboard. It will be written once Facebook App Review is approved. Apply for Meta App Review at: `https://developers.facebook.com/apps/` — select `pages_read_engagement` + `pages_search` permissions. Lead time: 2–4 weeks.
