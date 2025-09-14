"use client";

import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw, Square, FastForward, Rewind } from "lucide-react";

export interface BeatHeaderProps {
  bpm: number;
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onFastForward: () => void;
  onRewind: () => void;
  onExport: () => void;
}

export default function BeatHeader({
  bpm,
  isPlaying,
  onStart,
  onStop,
  onReset,
  onFastForward,
  onRewind,
  onExport,
}: BeatHeaderProps) {
  return (
    <div className="p-6 border-b border-border">
      <div className="flex items-center justify-between">
        {/* Left spacer */}
        <div className="flex-1"></div>
        
        {/* Center controls */}
        <div className="flex items-center gap-4">
          <Button onClick={onRewind} variant="outline" size="lg">
            <Rewind className="w-5 h-5" />
          </Button>
          <Button
            onClick={isPlaying ? onStop : onStart}
            size="lg"
            className="bg-white text-black hover:bg-gray-200"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>
          <Button onClick={onStop} variant="outline" size="lg">
            <Square className="w-5 h-5" />
          </Button>
          <Button onClick={onReset} variant="outline" size="lg">
            <RotateCcw className="w-5 h-5" />
          </Button>
          <Button onClick={onFastForward} variant="outline" size="lg">
            <FastForward className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Right export button */}
        <div className="flex-1 flex justify-end">
          <Button onClick={onExport} variant="outline" size="lg">
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
