import { useState, useEffect } from 'react';

export const useIsMobile = () => {
  const mq = window.matchMedia('(max-width: 767px)');
  const [isMobile, setIsMobile] = useState(mq.matches);
  useEffect(() => {
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
};
