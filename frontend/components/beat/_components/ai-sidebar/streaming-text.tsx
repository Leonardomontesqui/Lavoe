"use client";

import { useState, useEffect } from "react";

interface StreamingTextProps {
  text: string;
  className?: string;
  active?: boolean;
}

export function StreamingText({
  text,
  className = "",
  active = false,
}: StreamingTextProps) {
  const [visibleLength, setVisibleLength] = useState(0);

  useEffect(() => {
    if (!active) {
      // Immediately show full text when not actively streaming
      setVisibleLength(text.length);
      return;
    }

    // Reset when switching to active or text changes
    setVisibleLength((len) => (len === 0 ? 0 : len));

    const step = () =>
      setVisibleLength((len) => Math.min(text.length, len + 1));
    const id = window.setInterval(step, 12);
    return () => window.clearInterval(id);
  }, [text, active]);

  // If text grows because of real-time streaming, reveal progressively
  const content = active ? text.slice(0, visibleLength) : text;
  return <div className={className}>{content}</div>;
}
