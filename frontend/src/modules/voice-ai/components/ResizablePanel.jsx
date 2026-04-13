import React, { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'voice-ai-panel-width';

export default function ResizablePanel({ children, defaultWidth = 352, minWidth = 256, maxWidth = 480, storageKey }) {
  const key = storageKey || STORAGE_KEY;
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return Math.max(minWidth, Math.min(maxWidth, parseInt(saved)));
    } catch {}
    return defaultWidth;
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(key, String(width)); } catch {}
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [width, minWidth, maxWidth, key]);

  return (
    <div className="flex-shrink-0 relative flex" style={{ width }}>
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-400/50 active:bg-indigo-500/50 z-10 transition-colors"
      />
      <div className="flex-1 overflow-y-auto pl-2">{children}</div>
    </div>
  );
}
