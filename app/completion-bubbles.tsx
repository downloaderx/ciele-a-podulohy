'use client';

import { useEffect } from 'react';

export function CompletionBubbles({ onFinish }: { onFinish: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onFinish, 2900);
    return () => window.clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="completion-bubbles" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span className={`completion-bubble completion-bubble-${index}`} key={index} />
      ))}
    </div>
  );
}
