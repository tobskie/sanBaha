import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useReportVerification from './useReportVerification';

// --- mocks ---
const mockGetReportMedia = vi.fn();
const mockSubmitVerification = vi.fn();
const mockSubscribeToVerification = vi.fn();

vi.mock('../services/firebase', () => ({
  database: {},
  getReportMedia: (...args) => mockGetReportMedia(...args),
  submitVerification: (...args) => mockSubmitVerification(...args),
  subscribeToVerification: (...args) => mockSubscribeToVerification(...args),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user is logged in
  useAuth.mockReturnValue({ user: { uid: 'user-1' } });
  // Default: no media
  mockGetReportMedia.mockResolvedValue(null);
  // Default: subscribeToVerification calls callback immediately with empty data
  mockSubscribeToVerification.mockImplementation((_id, cb) => {
    cb({ count: 0, users: {}, verified: false });
    return vi.fn(); // unsubscribe
  });
  // Default: submitVerification resolves successfully
  mockSubmitVerification.mockResolvedValue({ count: 1, verified: false });
});

describe('useReportVerification', () => {
  it('returns zero count and null mediaUrl when reportId is null', () => {
    const { result } = renderHook(() => useReportVerification(null));
    expect(result.current.count).toBe(0);
    expect(result.current.mediaUrl).toBeNull();
    expect(mockSubscribeToVerification).not.toHaveBeenCalled();
    expect(mockGetReportMedia).not.toHaveBeenCalled();
  });

  it('subscribes to verification data on mount with valid reportId', () => {
    renderHook(() => useReportVerification('crowd-123'));
    expect(mockSubscribeToVerification).toHaveBeenCalledWith('crowd-123', expect.any(Function));
  });

  it('reflects count and verified from subscription callback', () => {
    mockSubscribeToVerification.mockImplementation((_id, cb) => {
      cb({ count: 3, users: { 'user-1': true, 'user-2': true, 'user-3': true }, verified: true });
      return vi.fn();
    });
    const { result } = renderHook(() => useReportVerification('crowd-123'));
    expect(result.current.count).toBe(3);
    expect(result.current.verified).toBe(true);
  });

  it('sets hasVerified=true when current user is in verifications.users', () => {
    mockSubscribeToVerification.mockImplementation((_id, cb) => {
      cb({ count: 1, users: { 'user-1': true }, verified: false });
      return vi.fn();
    });
    const { result } = renderHook(() => useReportVerification('crowd-123'));
    expect(result.current.hasVerified).toBe(true);
  });

  it('sets mediaUrl when getReportMedia resolves with downloadURL', async () => {
    mockGetReportMedia.mockResolvedValue({ downloadURL: 'https://example.com/img.jpg', isVideo: false });
    const { result } = renderHook(() => useReportVerification('crowd-123'));
    await act(async () => {});
    expect(result.current.mediaUrl).toBe('https://example.com/img.jpg');
    expect(result.current.isVideo).toBe(false);
  });

  it('calls submitVerification with reportId and userId on verify()', async () => {
    const { result } = renderHook(() => useReportVerification('crowd-123'));
    await act(async () => {
      await result.current.verify();
    });
    expect(mockSubmitVerification).toHaveBeenCalledWith('crowd-123', 'user-1');
  });

  it('sets hasVerified=true and no error when submitVerification throws already_verified', async () => {
    mockSubmitVerification.mockRejectedValue(new Error('already_verified'));
    const { result } = renderHook(() => useReportVerification('crowd-123'));
    await act(async () => {
      await result.current.verify();
    });
    expect(result.current.hasVerified).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets error message when submitVerification throws an unexpected error', async () => {
    mockSubmitVerification.mockRejectedValue(new Error('network_error'));
    const { result } = renderHook(() => useReportVerification('crowd-123'));
    await act(async () => {
      await result.current.verify();
    });
    expect(result.current.error).toBe('Failed to submit verification. Please try again.');
    expect(result.current.hasVerified).toBe(false);
  });

  it('does not call submitVerification when user is null', async () => {
    useAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useReportVerification('crowd-123'));
    await act(async () => {
      await result.current.verify();
    });
    expect(mockSubmitVerification).not.toHaveBeenCalled();
  });
});
