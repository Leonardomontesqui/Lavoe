"use client";

import { ReactNode, useRef, useState } from "react";
import { MusicBlock, Track } from "./types";
import { Waveform } from "./Waveform";

export interface BeatTimelineProps {
  currentTime: number;
  blocks: MusicBlock[];
  tracks: Track[];
  selectedBlock: string | null;
  onBlockClick: (id: string) => void;
  onTimelineClick?: (time: number, trackIndex: number) => void;
  onTimeChange?: (time: number) => void;
  onBlockMove?: (
    blockId: string,
    newTime: number,
    newTrackIndex: number
  ) => void;
  insertionPoint?: { time: number; trackIndex: number } | null;
  totalMeasures: number;
  onBeatPromptSubmit?: (
    prompt: string,
    selectionBounds: { x: number; y: number; width: number; height: number }
  ) => void;
}

function TimeMarkers({ totalMeasures }: { totalMeasures: number }) {
  const markers: ReactNode[] = [];
  const START_MEASURE = 1;
  const span = Math.max(1, totalMeasures - START_MEASURE);
  for (let j = 0; j <= span; j += 4) {
    const measure = START_MEASURE + j;
    if (measure % 16 === 0) {
      markers.push(
        <div
          key={`major-${measure}`}
          className="absolute top-0 h-6 w-0.5 bg-white"
          style={{ left: `${(j / span) * 100}%` }}
        >
          <span className="absolute -top-8 -left-3 text-sm text-white font-mono font-bold">
            {measure}
          </span>
        </div>
      );
    } else {
      markers.push(
        <div
          key={`minor-${measure}`}
          className="absolute top-0 h-4 w-0.5 bg-white/60"
          style={{ left: `${(j / span) * 100}%` }}
        >
          <span className="absolute -top-7 -left-2 text-xs text-white/80 font-mono">
            {measure}
          </span>
        </div>
      );
    }
  }
  for (let measure = START_MEASURE + 1; measure < totalMeasures; measure++) {
    if (measure % 4 !== 0) {
      markers.push(
        <div
          key={`beat-${measure}`}
          className="absolute top-0 h-2 w-px bg-white/30"
          style={{ left: `${((measure - START_MEASURE) / span) * 100}%` }}
        />
      );
    }
  }
  return <>{markers}</>;
}

export default function BeatTimeline({
  currentTime,
  blocks,
  tracks,
  selectedBlock,
  onBlockClick,
  onTimelineClick,
  onTimeChange,
  onBlockMove,
  insertionPoint,
  totalMeasures,
  onBeatPromptSubmit,
}: BeatTimelineProps) {
  // Store drag offset to maintain relative cursor position during drag
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  // Minimum number of visual rows so a single track isn't oversized
  const visualRows = Math.max(tracks.length, 4);

  // Selection rectangle state
  const [selectionStart, setSelectionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [beatPrompt, setBeatPrompt] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onTimelineClick || !event.currentTarget) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Calculate time position with snap to grid, starting at measure 1
    const START_MEASURE = 1;
    const span = Math.max(1, totalMeasures - START_MEASURE);
    const rawTimePosition = START_MEASURE + (x / rect.width) * span;
    const snappedTime = Math.max(
      START_MEASURE,
      Math.min(Math.round(rawTimePosition * 4) / 4, totalMeasures)
    );

    // Calculate track index
    const trackHeight = rect.height / tracks.length;
    const trackIndex = Math.floor(y / trackHeight);

    // Clamp track index to valid range
    const clampedTrackIndex = Math.max(
      0,
      Math.min(trackIndex, tracks.length - 1)
    );

    onTimelineClick(snappedTime, clampedTrackIndex);
  };

  const handleScrubberMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const handleMouseMove = (e: MouseEvent) => {
      if (!event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const START_MEASURE = 1;
      const span = Math.max(1, totalMeasures - START_MEASURE);
      const timePosition = Math.max(
        START_MEASURE,
        Math.min(START_MEASURE + (x / rect.width) * span, totalMeasures)
      );

      if (onTimeChange) {
        onTimeChange(timePosition);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Selection handlers - snap to grid
  const handleSelectionMouseDown = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    // Only start selection on left click with Shift key held down, and not when clicking on a block
    if (
      event.button !== 0 ||
      !event.shiftKey ||
      (event.target as HTMLElement).draggable
    )
      return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Snap to grid
    const START_MEASURE = 1;
    const span = Math.max(1, totalMeasures - START_MEASURE);
    const measureWidth = rect.width / span;
    const gridCellHeight = rect.height / 16; // Use the 16 horizontal grid lines

    // Calculate which measure and grid row we're in
    const measureIndex = Math.floor(x / measureWidth);
    const gridRowIndex = Math.floor(y / gridCellHeight);

    // Snap to grid boundaries
    const snappedX = measureIndex * measureWidth;
    const snappedY = gridRowIndex * gridCellHeight;

    // Selection height is 2 grid cells
    setSelectionStart({ x: snappedX, y: snappedY });
    setSelectionEnd({
      x: snappedX + measureWidth,
      y: snappedY + gridCellHeight * 2,
    });
    setIsSelecting(true);
  };

  const handleSelectionMouseMove = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!isSelecting || !selectionStart || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));

    // Snap to grid
    const START_MEASURE = 1;
    const span = Math.max(1, totalMeasures - START_MEASURE);
    const measureWidth = rect.width / span;
    const gridCellHeight = rect.height / 16; // Use the 16 horizontal grid lines

    // Calculate which measure we're hovering over
    const measureIndex = Math.floor(x / measureWidth);

    // Snap to grid boundaries (inclusive of the cell we're hovering over)
    // Keep height locked to 2 grid cells
    const snappedX = (measureIndex + 1) * measureWidth;
    const snappedY = selectionStart.y + gridCellHeight * 2;

    setSelectionEnd({ x: snappedX, y: snappedY });
  };

  const handleSelectionMouseUp = () => {
    if (isSelecting) {
      setIsSelecting(false);
      // Show prompt input after selection is complete
      if (selectionStart && selectionEnd) {
        setShowPromptInput(true);
      }
    }
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !beatPrompt.trim() ||
      !selectionStart ||
      !selectionEnd ||
      !onBeatPromptSubmit
    )
      return;

    // Calculate selection bounds for the modal
    const bounds = {
      x: Math.min(selectionStart.x, selectionEnd.x),
      y: Math.min(selectionStart.y, selectionEnd.y),
      width: Math.abs(selectionEnd.x - selectionStart.x),
      height: Math.abs(selectionEnd.y - selectionStart.y),
    };

    onBeatPromptSubmit(beatPrompt, bounds);

    // Clear selection and prompt
    setSelectionStart(null);
    setSelectionEnd(null);
    setShowPromptInput(false);
    setBeatPrompt("");
  };

  const handlePromptCancel = () => {
    setShowPromptInput(false);
    setBeatPrompt("");
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  return (
    <div className="flex-1 p-6">
      <div className="relative mb-8">
        <div className="relative h-10 mb-4 border-b border-border/70">
          <TimeMarkers totalMeasures={totalMeasures} />
          <div
            className="absolute top-0 h-full w-0.5 bg-blue-500 z-50 cursor-pointer hover:w-1 transition-all"
            style={{
              left: `${
                ((currentTime - 1) / Math.max(1, totalMeasures - 1)) * 100
              }%`,
            }}
            onMouseDown={handleScrubberMouseDown}
          >
            <div className="absolute -top-1 -left-2 w-0 h-0 border-l-2 border-r-2 border-b-4 border-l-transparent border-r-transparent border-b-blue-500"></div>
          </div>
        </div>

        <div className="mt-8 relative flex-1">
          {/* Timeline grid and blocks */}
          <div
            ref={timelineRef}
            className="flex-1 min-h-[calc(100vh-280px)] bg-background border border-border rounded relative overflow-hidden cursor-crosshair"
            onClick={handleTimelineClick}
            onMouseDown={handleSelectionMouseDown}
            onMouseMove={handleSelectionMouseMove}
            onMouseUp={handleSelectionMouseUp}
            onMouseLeave={handleSelectionMouseUp}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const blockId = e.dataTransfer.getData("text/plain");
              const rect = e.currentTarget.getBoundingClientRect();
              let x = e.clientX - rect.left;
              let y = e.clientY - rect.top;

              // Apply drag offset to maintain relative cursor position
              if (dragOffsetRef.current) {
                x -= dragOffsetRef.current.x;
                y -= dragOffsetRef.current.y;
              }

              // Calculate new position
              const START_MEASURE = 1;
              const span = Math.max(1, totalMeasures - START_MEASURE);
              const newTime = Math.max(
                START_MEASURE,
                START_MEASURE + (x / rect.width) * span
              );
              const trackHeight = rect.height / tracks.length;
              const newTrackIndex = Math.floor(y / trackHeight);

              // Snap to grid
              const snappedTime = Math.max(
                START_MEASURE,
                Math.min(Math.round(newTime * 4) / 4, totalMeasures)
              );
              const clampedTrackIndex = Math.max(
                0,
                Math.min(newTrackIndex, tracks.length - 1)
              );

              // Update block position
              if (onBlockMove) {
                onBlockMove(blockId, snappedTime, clampedTrackIndex);
              }

              // Clear drag offset
              dragOffsetRef.current = null;
            }}
          >
            {Array.from(
              { length: Math.max(1, totalMeasures - 1) + 1 },
              (_, j) => (
                <div
                  key={`grid-v-${j}`}
                  className={`absolute top-0 bottom-0 ${
                    (1 + j) % 16 === 0
                      ? "border-l-2 border-border"
                      : (1 + j) % 4 === 0
                      ? "border-l border-border/80"
                      : "border-l border-border/50"
                  }`}
                  style={{
                    left: `${(j / Math.max(1, totalMeasures - 1)) * 100}%`,
                  }}
                />
              )
            )}

            {Array.from({ length: 17 }, (_, i) => (
              <div
                key={`grid-h-${i}`}
                className="absolute left-0 right-0 border-t border-border/40"
                style={{ top: `${(i / 16) * 100}%` }}
              />
            ))}

            <div
              className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-50"
              style={{
                left: `${
                  ((currentTime - 1) / Math.max(1, totalMeasures - 1)) * 100
                }%`,
              }}
            />

            {/* Selection Rectangle Overlay */}
            {selectionStart && selectionEnd && (
              <div
                className="absolute bg-gray-500/30 border border-gray-400/50 z-20 pointer-events-none"
                style={{
                  left: `${Math.min(selectionStart.x, selectionEnd.x)}px`,
                  top: `${Math.min(selectionStart.y, selectionEnd.y)}px`,
                  width: `${Math.abs(selectionEnd.x - selectionStart.x)}px`,
                  height: `${Math.abs(selectionEnd.y - selectionStart.y)}px`,
                }}
              />
            )}

            {/* Prompt Input Overlay */}
            {showPromptInput && selectionStart && selectionEnd && (
              <div
                className="absolute z-30 pointer-events-auto"
                style={{
                  left: `${Math.min(selectionStart.x, selectionEnd.x)}px`,
                  top: `${Math.min(selectionStart.y, selectionEnd.y) - 60}px`,
                  minWidth: `${Math.abs(selectionEnd.x - selectionStart.x)}px`,
                }}
              >
                <form
                  onSubmit={handlePromptSubmit}
                  className="bg-background border border-border rounded-lg shadow-lg p-3"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={beatPrompt}
                      onChange={(e) => setBeatPrompt(e.target.value)}
                      placeholder="Describe the beat you want..."
                      className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-primary"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Generate
                    </button>
                    <button
                      type="button"
                      onClick={handlePromptCancel}
                      className="px-3 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Insertion Point Indicator */}
            {insertionPoint && (
              <>
                {/* Vertical line across the entire timeline */}
                <div
                  className="absolute w-0.5 bg-green-500 z-40"
                  style={{
                    left: `${
                      ((insertionPoint.time - 1) /
                        Math.max(1, totalMeasures - 1)) *
                      100
                    }%`,
                    top: "0%",
                    height: "100%",
                  }}
                />
                {/* Highlighted track area */}
                <div
                  className="absolute bg-green-500/20 border border-green-500/50 z-30"
                  style={{
                    left: `${
                      ((insertionPoint.time - 1) /
                        Math.max(1, totalMeasures - 1)) *
                      100
                    }%`,
                    top: `${
                      (insertionPoint.trackIndex / tracks.length) * 100
                    }%`,
                    height: `${100 / tracks.length}%`,
                    width: "2%",
                  }}
                />
                {/* Arrow indicator */}
                <div
                  className="absolute w-0 h-0 border-l-2 border-r-2 border-b-4 border-l-transparent border-r-transparent border-b-green-500 z-50"
                  style={{
                    left: `${
                      ((insertionPoint.time - 1) /
                        Math.max(1, totalMeasures - 1)) *
                      100
                    }%`,
                    top: `${
                      (insertionPoint.trackIndex / tracks.length) * 100
                    }%`,
                    transform: "translateX(-50%)",
                  }}
                />
              </>
            )}

            {blocks.map((block) => (
              <div
                key={block.id}
                className={`absolute ${
                  block.color
                } rounded cursor-move border-2 transition-all ${
                  selectedBlock === block.id
                    ? "border-white"
                    : "border-transparent"
                } hover:border-gray-300 opacity-90 z-10`}
                style={{
                  left: `${
                    ((block.startTime - 1) / Math.max(1, totalMeasures - 1)) *
                    100
                  }%`,
                  width: `${
                    (block.duration / Math.max(1, totalMeasures - 1)) * 100
                  }%`,
                  top: `${(block.track / visualRows) * 60 + 10}%`,
                  height: `${60 / visualRows - 2}%`,
                }}
                onClick={() => onBlockClick(block.id)}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", block.id);
                  e.dataTransfer.effectAllowed = "move";

                  // Calculate drag offset relative to the timeline container
                  const timelineRect =
                    e.currentTarget.parentElement?.getBoundingClientRect();
                  const blockRect = e.currentTarget.getBoundingClientRect();

                  if (timelineRect && blockRect) {
                    // Calculate where on the block the user clicked (relative to timeline)
                    const dragX = e.clientX - blockRect.left;
                    const dragY = e.clientY - blockRect.top;

                    // Store the offset for use during drop
                    dragOffsetRef.current = { x: dragX, y: dragY };
                  }
                }}
                onDragEnd={(e) => {
                  e.preventDefault();
                }}
              >
                <div className="p-1 h-full flex items-center justify-center overflow-hidden">
                  {block.audioFile || block.audioBlob ? (
                    <Waveform
                      audioFile={block.audioFile}
                      audioBlob={block.audioBlob}
                      width={Math.max(
                        80,
                        Math.floor((block.duration / totalMeasures) * 800)
                      )}
                      height={Math.max(24, Math.floor((60 / visualRows) * 0.9))}
                      color="rgba(255, 255, 255, 0.8)"
                      className="w-full h-full"
                    />
                  ) : (
                    <span className="text-xs font-medium text-white/80 truncate px-1">
                      {block.name}
                    </span>
                  )}
                </div>
              </div>
            ))}

            <div className="absolute top-2 left-2 text-xs text-gray-500">
              Piano Roll / MIDI Editor
            </div>

            {insertionPoint && (
              <div className="absolute top-2 right-2 text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
                Insertion point set - Record audio to place here
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
