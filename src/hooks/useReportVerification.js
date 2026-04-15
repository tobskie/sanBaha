import { useState, useEffect, useCallback } from 'react';
import { subscribeToVerification, submitVerification, getReportMedia } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function useReportVerification(reportId) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [verified, setVerified] = useState(false);
  const [hasVerified, setHasVerified] = useState(false);
  const [mediaUrl, setMediaUrl] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Real-time verification count subscription
  useEffect(() => {
    if (!reportId) return;
    setHasVerified(false);
    setCount(0);
    setVerified(false);
    setError(null);
    const unsubscribe = subscribeToVerification(reportId, (data) => {
      setCount(data.count || 0);
      setVerified(data.verified || false);
      if (user && data.users?.[user.uid]) {
        setHasVerified(true);
      }
    });
    return unsubscribe;
  }, [reportId, user]);

  // One-time media fetch on mount
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    getReportMedia(reportId).then((media) => {
      if (cancelled) return;
      if (media) {
        setMediaUrl(media.downloadURL);
        setIsVideo(media.isVideo);
      }
    });
    return () => { cancelled = true; };
  }, [reportId]);

  const verify = useCallback(async () => {
    if (!user || submitting || hasVerified) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitVerification(reportId, user.uid);
    } catch (err) {
      if (err.message === 'already_verified') {
        setHasVerified(true);
      } else {
        setError('Failed to submit verification. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [user, hasVerified, reportId]);

  return { count, verified, hasVerified, mediaUrl, isVideo, submitting, error, verify };
}
