"use client";

import { ToolOperation } from "../../types";

interface OperationCardProps {
  operation: ToolOperation;
  colorIndex: number;
  isLast: boolean;
}

const getOperationDescription = (operation: ToolOperation) => {
  switch (operation.type) {
    case "moveBlock":
      if (operation.state === "input-available" && operation.input) {
        return `Moving block "${operation.input.blockId}" to measure ${operation.input.newStartTime}`;
      }
      return "Preparing to move block...";
    case "chopAudio":
      if (operation.state === "input-available" && operation.input) {
        return `Chopping track "${operation.input.trackId}" (${operation.input.maxChops} chops, ${operation.input.nClusters} clusters)`;
      }
      return "Preparing to chop audio...";
    case "adjustSpeed":
      if (operation.state === "input-available" && operation.input) {
        return `Adjusting speed of block "${operation.input.blockId}" to ${operation.input.speedFactor}x`;
      }
      return "Preparing to adjust speed...";
    case "loop":
      if (operation.state === "input-available" && operation.input) {
        return `Looping block "${operation.input.blockId}" ${operation.input.times} times`;
      }
      return "Preparing to loop block...";
    case "text":
      return operation.text || "Processing text...";
    default:
      return "Processing...";
  }
};

export function OperationCard({
  operation,
  colorIndex,
  isLast,
}: OperationCardProps) {
  const isProcessing =
    operation.state === "input-streaming" ||
    operation.state === "input-available";
  const isComplete =
    operation.state === "output-available" || operation.state === "complete";
  const hasError = operation.state === "output-error";

  return (
    <div className="space-y-2">
      <div className="flex">
        {/* Vertical indicator */}
        <div className="flex flex-col items-center mr-4">
          {/* Circle indicator */}
          <div
            className={`w-3 h-3 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
              isComplete ? "border-green-400/60" : "border-opacity-60"
            }`}
            style={{
              borderColor: isComplete ? undefined : "rgba(250, 204, 21, 0.6)",
              backgroundColor: isComplete
                ? "rgba(34, 197, 94, 0.2)"
                : "rgba(250, 204, 21, 0.3)",
            }}
          >
            {isComplete && (
              <div className="w-1.5 h-1.5 rounded-full bg-green-400/80" />
            )}
            {isProcessing && (
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: "rgba(250, 204, 21, 0.8)" }}
              />
            )}
          </div>

          {/* Vertical line */}
          {!isLast && (
            <div
              className="w-0.5 flex-1 rounded-full mt-1"
              style={{
                backgroundColor: "rgba(250, 204, 21, 0.2)",
                minHeight: "20px",
              }}
            />
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 flex items-start">
          <p className="text-sm text-white/60 leading-relaxed">
            {getOperationDescription(operation)}
          </p>
        </div>
      </div>
    </div>
  );
}
