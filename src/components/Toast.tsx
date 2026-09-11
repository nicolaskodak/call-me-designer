import React, { useEffect } from 'react';

const TOAST_MS = 3000;

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(id);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div role="status" data-testid="toast" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded bg-neutral-800 border border-neutral-600 text-sm text-white shadow-xl">
      {message}
    </div>
  );
}
