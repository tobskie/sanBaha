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

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn(),
  update: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
}));

vi.mock('../data/mockData', () => ({
  getStatusFromWaterLevel: vi.fn(),
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
