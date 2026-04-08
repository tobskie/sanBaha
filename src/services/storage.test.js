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
