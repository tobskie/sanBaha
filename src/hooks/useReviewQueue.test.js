import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useReviewQueue } from './useReviewQueue';

vi.mock('../services/firebase', () => ({ database: {} }));

let capturedCallback;
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn((ref, cb) => { capturedCallback = cb; return vi.fn(); }),
}));

describe('useReviewQueue', () => {
  beforeEach(() => { capturedCallback = undefined; });

  it('returns 0 when no data', () => {
    const { result } = renderHook(() => useReviewQueue());
    act(() => capturedCallback({ val: () => null }));
    expect(result.current).toBe(0);
  });

  it('counts only complete+unverified items', () => {
    const { result } = renderHook(() => useReviewQueue());
    act(() => capturedCallback({
      val: () => ({
        a: { processingStatus: 'complete', mediaVerified: false },
        b: { processingStatus: 'complete', mediaVerified: true },
        c: { processingStatus: 'pending' },
        d: { processingStatus: 'complete' },
      })
    }));
    expect(result.current).toBe(2); // a and d
  });
});
