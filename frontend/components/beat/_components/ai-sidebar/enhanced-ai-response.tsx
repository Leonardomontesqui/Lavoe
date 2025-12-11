"use client";

import { useState, useEffect } from "react";
import { EnhancedAIResponseProps, ToolOperation } from "../../types";
import { OperationCard } from "./operation-card";
import { colors } from "../../_constants/ai-sidebar-constants";

export function EnhancedAIResponse({
  operations,
  isStreaming = false,
  className = "",
}: EnhancedAIResponseProps) {
  const [visibleOperations, setVisibleOperations] = useState<ToolOperation[]>(
    []
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (operations.length === 0) return;

    const timer = setInterval(() => {
      if (currentIndex < operations.length) {
        setVisibleOperations((prev) => [...prev, operations[currentIndex]]);
        setCurrentIndex((prev) => prev + 1);
      }
    }, 800);

    return () => clearInterval(timer);
  }, [operations, currentIndex]);

  if (operations.length === 0) return null;

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center space-x-2 mb-3">
        <div className="flex space-x-1">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full animate-pulse"
              style={{
                backgroundColor: colors[i % colors.length].replace(
                  "0.08",
                  "0.3"
                ),
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Operations */}
      <div className="space-y-4">
        {visibleOperations.map((operation, index) => (
          <OperationCard
            key={operation.id}
            operation={operation}
            colorIndex={index}
            isLast={index === visibleOperations.length - 1}
          />
        ))}
      </div>

      {/* Streaming indicator */}
      {isStreaming && visibleOperations.length === operations.length && (
        <div className="flex justify-center py-3" />
      )}
    </div>
  );
}
