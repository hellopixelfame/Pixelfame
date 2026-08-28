import { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ message: '', visible: false });
  const timerRef = useRef(null);

  const showToast = useCallback((message) => {
    clearTimeout(timerRef.current);
    setToast({ message, visible: true });
    timerRef.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2400);
  }, []);

  return { toast, showToast };
}
