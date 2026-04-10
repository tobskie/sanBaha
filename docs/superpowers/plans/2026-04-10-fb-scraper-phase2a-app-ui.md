# FB Scraper — Phase 2A: App Verification UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show FB-sourced flood hotspots on the map immediately as unverified (amber, "?" badge), let logged-in users verify them, and flip to verified at 3 votes.

**Architecture:** `subscribeToCrowdReports` in firebase.js provides a real-time feed of `/crowd_reports`. App.jsx filters FB-sourced entries into a `fbHotspots` state array, merges them with sensor hotspots for display, and fires a toast on new arrivals. HotspotDetail renders an unverified panel with a verify button for FB hotspots. `verifyCrowdReport` runs a Firebase transaction to increment `verificationCount` and set `verified: true` at 3. `retentionCleanup` gains rules to drop stale unverified FB hotspots at 6 h (0 votes) and 24 h (1–2 votes).

**Tech Stack:** React 19, Firebase Realtime DB (`runTransaction`), Vitest

**Spec reference:** `docs/superpowers/specs/2026-04-10-fb-scraper-community-verification-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/services/firebase.js` | Add `subscribeToCrowdReports`, `_buildVerifyTransaction`, `verifyCrowdReport` |
| Create | `src/services/firebase.test.js` | Unit tests for `_buildVerifyTransaction` pure function |
| Modify | `functions/src/retentionCleanup.js` | Stale FB hotspot cleanup rules (6 h / 24 h) |
| Modify | `src/components/FloodMap.jsx` | Amber marker + "?" badge + pulse for unverified FB hotspots |
| Modify | `src/components/HotspotDetail.jsx` | Unverified FB panel + verify button + verified state |
| Modify | `src/App.jsx` | `fbHotspots` state, crowd report subscription, `allHotspots` merge, toast, `handleVerify` |

---

## Task 1: Firebase helpers — subscribeToCrowdReports + verify transaction

**Files:**
- Modify: `src/services/firebase.js`
- Create: `src/services/firebase.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/services/firebase.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn((_, path) => ({ path })),
  onValue: vi.fn(),
  push: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  runTransaction: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: vi.fn(() => ({})),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(() => ({})) }));
vi.mock('../data/mockData', () => ({ getStatusFromWaterLevel: vi.fn() }));

describe('_buildVerifyTransaction', () => {
  it('adds uid to verifications and increments count', async () => {
    const { _buildVerifyTransaction } = await import('./firebase.js');
    const fn = _buildVerifyTransaction('uid-123');
    const result = fn({ verificationCount: 1, verifications: { 'uid-456': true }, verified: false });
    expect(result.verificationCount).toBe(2);
    expect(result.verifications['uid-123']).toBe(true);
    expect(result.verified).toBe(false);
  });

  it('sets verified: true when count reaches 3', async () => {
    const { _buildVerifyTransaction } = await import('./firebase.js');
    const fn = _buildVerifyTransaction('uid-c');
    const result = fn({ verificationCount: 2, verifications: { 'uid-a': true, 'uid-b': true }, verified: false });
    expect(result.verificationCount).toBe(3);
    expect(result.verified).toBe(true);
  });

  it('returns undefined (abort) when uid already voted', async () => {
    const { _buildVerifyTransaction } = await import('./firebase.js');
    const fn = _buildVerifyTransaction('uid-123');
    expect(fn({ verificationCount: 1, verifications: { 'uid-123': true }, verified: false })).toBeUndefined();
  });

  it('returns null unchanged when entry is missing', async () => {
    const { _buildVerifyTransaction } = await import('./firebase.js');
    const fn = _buildVerifyTransaction('uid-123');
    expect(fn(null)).toBeNull();
  });

  it('handles missing verifications field on first vote', async () => {
    const { _buildVerifyTransaction } = await import('./firebase.js');
    const fn = _buildVerifyTransaction('uid-first');
    const result = fn({ verificationCount: 0, verified: false });
    expect(result.verificationCount).toBe(1);
    expect(result.verifications['uid-first']).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```
npx vitest run src/services/firebase.test.js
```

Expected: FAIL — `_buildVerifyTransaction` is not exported yet

- [ ] **Step 3: Add helpers to firebase.js**

In `src/services/firebase.js`, change the existing database import line from:

```js
import { getDatabase, ref, onValue, push, get, set as dbSet } from 'firebase/database';
```

to:

```js
import { getDatabase, ref, onValue, push, get, set as dbSet, runTransaction } from 'firebase/database';
```

Then append at the end of `src/services/firebase.js`:

```js
// Real-time listener for all crowd reports
export const subscribeToCrowdReports = (callback) => {
  const reportsRef = ref(database, 'crowd_reports');
  return onValue(reportsRef, (snapshot) => {
    const data = snapshot.val();
    callback(
      data
        ? Object.entries(data).map(([id, v]) => ({ id, ...v }))
        : []
    );
  });
};

// Pure transaction function — exported for testing
export const _buildVerifyTransaction = (uid) => (current) => {
  if (current === null) return current;          // abort — entry gone
  if (current.verifications?.[uid]) return undefined; // abort — already voted
  const newCount = (current.verificationCount || 0) + 1;
  return {
    ...current,
    verifications: { ...(current.verifications || {}), [uid]: true },
    verificationCount: newCount,
    verified: newCount >= 3,
  };
};

// Run a verification vote for a FB-sourced crowd report
export const verifyCrowdReport = (postId, uid) =>
  runTransaction(ref(database, `crowd_reports/${postId}`), _buildVerifyTransaction(uid));
```

- [ ] **Step 4: Run tests — verify they pass**

```
npx vitest run src/services/firebase.test.js
```

Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add src/services/firebase.js src/services/firebase.test.js
git commit -m "feat: add subscribeToCrowdReports and verifyCrowdReport to firebase service"
```

---

## Task 2: retentionCleanup — stale FB hotspot rules

**Files:**
- Modify: `functions/src/retentionCleanup.js`

- [ ] **Step 1: Replace the crowd_reports cleanup block**

In `functions/src/retentionCleanup.js`, replace the entire crowd_reports block (lines 24–37):

```js
    // 1. Clean up /crowd_reports
    //    - FB unverified, 0 verifications: delete after 6 hours
    //    - FB unverified, 1–2 verifications: delete after 24 hours
    //    - All others (citizen + verified FB): delete after 90 days
    const crowdSnap = await db.ref('/crowd_reports').once('value');
    const crowdVal = crowdSnap.val();
    const MS_6_HOURS = 6 * 60 * 60 * 1000;
    const MS_24_HOURS = 24 * 60 * 60 * 1000;
    if (crowdVal) {
      const crowdDeletions = [];
      for (const [key, entry] of Object.entries(crowdVal)) {
        const age = now - new Date(entry.submittedAt).getTime();
        let shouldDelete = false;
        if (entry.source === 'facebook' && !entry.verified) {
          const count = entry.verificationCount || 0;
          if (count === 0 && age > MS_6_HOURS) shouldDelete = true;
          else if (count < 3 && age > MS_24_HOURS) shouldDelete = true;
        } else if (age > MS_90_DAYS) {
          shouldDelete = true;
        }
        if (shouldDelete) {
          crowdDeletions.push(db.ref(`/crowd_reports/${key}`).remove());
          crowdReportsDeleted++;
        }
      }
      await Promise.all(crowdDeletions);
    }
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/retentionCleanup.js
git commit -m "feat: add stale FB hotspot cleanup rules to retentionCleanup"
```

---

## Task 3: FloodMap — amber marker + "?" badge for unverified FB hotspots

**Files:**
- Modify: `src/components/FloodMap.jsx`

- [ ] **Step 1: Update `getMarkerColor` to accept a hotspot object**

In `src/components/FloodMap.jsx`, replace:

```js
    const getMarkerColor = (status) => {
        switch (status) {
            case 'clear': return '#00ff88';
            case 'warning': return '#ffcc00';
            case 'flooded': return '#ff4444';
            default: return '#00d4ff';
        }
    };
```

with:

```js
    const getMarkerColor = (hotspot) => {
        if (hotspot.source === 'facebook' && !hotspot.verified) return '#f59e0b';
        switch (hotspot.status) {
            case 'clear': return '#00ff88';
            case 'warning': return '#ffcc00';
            case 'flooded': return '#ff4444';
            default: return '#00d4ff';
        }
    };
```

- [ ] **Step 2: Update `getMarkerColor` call sites**

There are two calls to `getMarkerColor(hotspot.status)` inside the marker rendering loop. Replace both with `getMarkerColor(hotspot)`:

The outer ring `backgroundColor`:
```js
                                style={{
                                    backgroundColor: getMarkerColor(hotspot),
```

The inner circle `backgroundColor`:
```js
                                style={{ backgroundColor: getMarkerColor(hotspot) }}
```

- [ ] **Step 3: Add pulse animation for unverified FB markers**

In the marker container div className, replace:

```jsx
                        <div
                            className={`
                relative cursor-pointer transition-transform hover:scale-110
                ${hotspot.status === 'flooded' ? 'animate-pulse' : ''}
                ${selectedHotspot?.id === hotspot.id ? 'scale-125' : ''}
              `}
                        >
```

with:

```jsx
                        <div
                            className={`
                relative cursor-pointer transition-transform hover:scale-110
                ${hotspot.status === 'flooded' || (hotspot.source === 'facebook' && !hotspot.verified) ? 'animate-pulse' : ''}
                ${selectedHotspot?.id === hotspot.id ? 'scale-125' : ''}
              `}
                        >
```

- [ ] **Step 4: Add "?" badge for unverified FB hotspots**

After the existing crowdsourced indicator block, add:

```jsx
                            {/* Unverified FB indicator */}
                            {hotspot.source === 'facebook' && !hotspot.verified && (
                                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full border border-white flex items-center justify-center text-[8px] font-bold text-white">
                                    ?
                                </div>
                            )}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/FloodMap.jsx
git commit -m "feat: amber unverified marker and ? badge for FB hotspots in FloodMap"
```

---

## Task 4: HotspotDetail — unverified FB panel + verify button

**Files:**
- Modify: `src/components/HotspotDetail.jsx`

- [ ] **Step 1: Rewrite HotspotDetail.jsx**

Replace the entire file contents with:

```jsx
import { useState } from 'react';
import { getStatusDetails } from '../data/mockData';

const HotspotDetail = ({ hotspot, onClose, onNavigate, isRouting, user, onVerify }) => {
    const [isVerifying, setIsVerifying] = useState(false);
    if (!hotspot) return null;

    const statusDetails = getStatusDetails(hotspot.status);
    const isFbUnverified = hotspot.source === 'facebook' && !hotspot.verified;
    const hasUserVerified = user && hotspot.verifications?.[user.uid];
    const verificationCount = hotspot.verificationCount || 0;

    const formatTimeAgo = (isoString) => {
        const diffMin = Math.floor((Date.now() - new Date(isoString)) / 60000);
        if (diffMin < 60) return `${diffMin} min ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return new Date(isoString).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    };

    const handleVerify = async () => {
        if (!onVerify || !user) return;
        setIsVerifying(true);
        try {
            await onVerify(hotspot.id, user.uid);
        } finally {
            setIsVerifying(false);
        }
    };

    if (isFbUnverified) {
        return (
            <div className="absolute left-3 right-3 bottom-[290px] z-[1001]">
                <div className="glass rounded-2xl p-3 shadow-xl border border-amber-500/30">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/20">
                                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-amber-300 text-sm">Unverified Report</h3>
                                <p className="text-[10px] text-slate-400">Sourced from Facebook</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 active:scale-95"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* FB Post Text */}
                    {hotspot.fbText && (
                        <div className="bg-[#0a1628] rounded-xl p-2.5 mb-2">
                            <p className="text-xs text-slate-300 line-clamp-3 italic">
                                &ldquo;{hotspot.fbText}&rdquo;
                            </p>
                            {hotspot.authorName && (
                                <p className="text-[10px] text-slate-500 mt-1 text-right">— {hotspot.authorName}</p>
                            )}
                        </div>
                    )}

                    {/* Location + Time */}
                    <div className="flex items-center gap-1 mb-2">
                        <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-[10px] text-slate-400 truncate">{hotspot.location}</span>
                        {hotspot.lastUpdate && (
                            <span className="text-[10px] text-slate-500 ml-auto flex-shrink-0">{formatTimeAgo(hotspot.lastUpdate)}</span>
                        )}
                    </div>

                    {/* Verification progress bar */}
                    <div className="flex items-center gap-1.5 mb-2.5">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className={`flex-1 h-1 rounded-full ${i < verificationCount ? 'bg-amber-400' : 'bg-[#162d4d]'}`}
                            />
                        ))}
                        <span className="text-[10px] text-slate-400 ml-1 flex-shrink-0">
                            {verificationCount}/3 verified
                        </span>
                    </div>

                    {/* Verify Button */}
                    {hasUserVerified ? (
                        <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-2">
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-xs text-emerald-400 font-medium">You verified this</span>
                        </div>
                    ) : (
                        <button
                            onClick={handleVerify}
                            disabled={isVerifying}
                            className="w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            {isVerifying ? (
                                <>
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Have you seen this flood? Verify
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Existing sensor hotspot panel (unchanged logic)
    return (
        <div className="absolute left-3 right-3 bottom-[290px] z-[1001]">
            <div className="glass rounded-2xl p-3 shadow-xl border border-[#00d4ff]/20">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`
              w-10 h-10 rounded-xl flex items-center justify-center
              ${hotspot.status === 'clear' ? 'bg-emerald-500/20' :
                                hotspot.status === 'warning' ? 'bg-amber-500/20' : 'bg-red-500/20'}
            `}>
                            {hotspot.status === 'clear' ? (
                                <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            ) : hotspot.status === 'warning' ? (
                                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            )}
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm">{hotspot.name}</h3>
                            <p className="text-[10px] text-slate-400">{hotspot.location}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg bg-[#162d4d] flex items-center justify-center text-slate-400 active:scale-95"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="p-2 bg-[#0a1628] rounded-lg text-center">
                        <p className={`text-xl font-bold ${hotspot.status === 'clear' ? 'text-emerald-400' :
                                hotspot.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                            }`}>
                            {hotspot.waterLevel}
                        </p>
                        <p className="text-[9px] text-slate-400">cm</p>
                    </div>
                    <div className="p-2 bg-[#0a1628] rounded-lg text-center">
                        <p className={`text-xs font-bold ${hotspot.status === 'clear' ? 'text-emerald-400' :
                                hotspot.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                            }`}>
                            {statusDetails.label}
                        </p>
                        <p className="text-[9px] text-slate-400">status</p>
                    </div>
                    <div className="p-2 bg-[#0a1628] rounded-lg text-center">
                        <p className="text-xs font-bold text-[#00d4ff]">
                            {new Date(hotspot.lastUpdate).toLocaleTimeString('en-PH', {
                                hour: '2-digit', minute: '2-digit', hour12: true,
                            })}
                        </p>
                        <p className="text-[9px] text-slate-400">updated</p>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={onNavigate}
                    disabled={isRouting}
                    className={`
            w-full py-2.5 rounded-xl font-medium text-xs
            flex items-center justify-center gap-2 transition-all active:scale-[0.98]
            ${isRouting ? 'opacity-50 cursor-not-allowed' : ''}
            ${hotspot.status === 'flooded'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-[#0a1628]'}
          `}
                >
                    {isRouting ? (
                        <>
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Calculating route...
                        </>
                    ) : (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                            {hotspot.status === 'flooded' ? 'Find Safe Route' : 'Navigate Here'}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default HotspotDetail;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/HotspotDetail.jsx
git commit -m "feat: add unverified FB report panel and verify button to HotspotDetail"
```

---

## Task 5: App.jsx — wire FB hotspots, toast, and verify handler

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update firebase import**

In `src/App.jsx`, change:

```js
import { subscribeToFloodData, submitFloodReport } from './services/firebase';
```

to:

```js
import { subscribeToFloodData, submitFloodReport, subscribeToCrowdReports, verifyCrowdReport } from './services/firebase';
```

- [ ] **Step 2: Add fbHotspots state and prevFbIdsRef**

After the existing line `const [crowdsourcedReports, setCrowdsourcedReports] = useState([]);`, add:

```js
  const [fbHotspots, setFbHotspots] = useState([]);
  const prevFbIdsRef = useRef(new Set());
```

- [ ] **Step 3: Add crowd report subscription effect**

After the closing `}, [autoRefresh, soundAlerts]);` of the existing flood data subscription effect, add:

```js
  // Real-time subscription for FB-sourced crowd reports
  useEffect(() => {
    const unsubscribe = subscribeToCrowdReports((reports) => {
      const fbOnly = reports.filter(r => r.source === 'facebook');
      const newUnverified = fbOnly.filter(
        r => !r.verified && !prevFbIdsRef.current.has(r.id)
      );
      if (newUnverified.length > 0) {
        setToast({
          message: `New unverified flood report near ${newUnverified[0].location || 'Lipa City'} — tap to verify`,
          type: 'info',
        });
      }
      prevFbIdsRef.current = new Set(fbOnly.map(r => r.id));
      setFbHotspots(fbOnly);
    });
    return () => unsubscribe();
  }, []);
```

- [ ] **Step 4: Add handleVerify function**

After the `handleReportSubmit` function, add:

```js
  const handleVerify = async (postId, uid) => {
    if (!requireAuth()) return;
    try {
      await verifyCrowdReport(postId, uid);
    } catch {
      setToast({ message: 'Could not verify report. Please try again.', type: 'error' });
    }
  };
```

- [ ] **Step 5: Compute allHotspots**

Right before the `return (` in the App component body, add:

```js
  const allHotspots = [
    ...hotspots,
    ...fbHotspots.map(r => ({
      id: r.id,
      name: r.location?.split(',')[0] || 'Community Report',
      location: r.location || 'Lipa City',
      coordinates: r.coordinates,
      waterLevel: r.severity === 'flooded' ? 80 : 50,
      status: r.verified ? (r.severity || 'warning') : 'warning',
      lastUpdate: r.submittedAt,
      source: 'facebook',
      verified: r.verified ?? false,
      verificationCount: r.verificationCount || 0,
      verifications: r.verifications || {},
      fbText: r.fbText,
      authorName: r.authorName,
      fbPostUrl: r.fbPostUrl,
    })),
  ];
```

- [ ] **Step 6: Update JSX — FloodMap, BottomSheet, HotspotDetail**

In the JSX return, make three edits:

**(a)** `<FloodMap` — change `hotspots={hotspots}` to `hotspots={allHotspots}`

**(b)** `<BottomSheet` — change `hotspots={hotspots}` to `hotspots={allHotspots}`

**(c)** `<HotspotDetail` — add `user` and `onVerify` props:

```jsx
        <HotspotDetail
          hotspot={selectedHotspot}
          onClose={() => setSelectedHotspot(null)}
          onNavigate={() => handleNavigate(selectedHotspot)}
          isRouting={isRouting}
          user={user}
          onVerify={handleVerify}
        />
```

Note: keep `createFloodZones(hotspots)` (sensor-only) unchanged — FB hotspots should not generate flood zone polygons.

- [ ] **Step 7: Run all tests**

```
npx vitest run
```

Expected: all passing

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: subscribe to FB crowd reports, merge into map, wire verify handler"
```
