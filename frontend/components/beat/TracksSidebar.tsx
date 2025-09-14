"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Volume2, Mic, Plus, MoreHorizontal, Upload, FileAudio } from "lucide-react";
import { Track } from "./types";
import { FileUpload } from "./FileUpload";
import { AudioPlayer } from "./AudioPlayer";
import { RecordingComponent } from "./RecordingComponent";

interface TracksSidebarProps {
  tracks: Track[];
  onVolumeChange: (trackId: string, volume: number) => void;
  onMuteToggle: (trackId: string) => void;
  onAddTrack: () => void;
  onFileUpload: (file: File) => void;
  onRecordingComplete: (audioBlob: Blob) => void;
}

export function TracksSidebar({
  tracks,
  onVolumeChange,
  onMuteToggle,
  onAddTrack,
  onFileUpload,
  onRecordingComplete,
}: TracksSidebarProps) {
  const [activeView, setActiveView] = useState<"tracks" | "record" | "upload" | null>(
    null
  );

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header with Logo */}
      <div className="h-14 flex items-center justify-front px-3">
        <img src="/Lavoe22.png" alt="Lavoe" className="h-5 w-auto" />
      </div>

      {/* Main Container */}
      <div className="flex-1 flex">
        {/* Left Navigation */}
        <div className="w-[80px] border-r border-border flex flex-col">
          <div className="flex flex-col items-center pt-3 gap-2">
            <Button
              variant="ghost"
              className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-2 group ${
                activeView === "tracks" ? "bg-muted/50" : "hover:bg-muted/30"
              }`}
              onClick={() =>
                setActiveView(activeView === "tracks" ? null : "tracks")
              }
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeView === "tracks"
                    ? "bg-indigo-500"
                    : "bg-muted group-hover:bg-muted/80"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="2"
                    y="3"
                    width="12"
                    height="2"
                    rx="1"
                    fill="currentColor"
                  />
                  <rect
                    x="2"
                    y="7"
                    width="12"
                    height="2"
                    rx="1"
                    fill="currentColor"
                  />
                  <rect
                    x="2"
                    y="11"
                    width="12"
                    height="2"
                    rx="1"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <span className="text-[11px] text-muted-foreground">Tracks</span>
            </Button>

            <Button
              variant="ghost"
              className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-2 group ${
                activeView === "record" ? "bg-muted/50" : "hover:bg-muted/30"
              }`}
              onClick={() =>
                setActiveView(activeView === "record" ? null : "record")
              }
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeView === "record"
                    ? "bg-indigo-500"
                    : "bg-muted group-hover:bg-muted/80"
                }`}
              >
                <Mic className="h-4.5 w-4.5 text-white" />
              </div>
              <span className="text-[11px] text-muted-foreground">Record</span>
            </Button>

            <Button
              variant="ghost"
              className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-2 group ${
                activeView === "upload" ? "bg-muted/50" : "hover:bg-muted/30"
              }`}
              onClick={() =>
                setActiveView(activeView === "upload" ? null : "upload")
              }
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  activeView === "upload"
                    ? "bg-indigo-500"
                    : "bg-muted group-hover:bg-muted/80"
                }`}
              >
                <Upload className="h-4.5 w-4.5 text-white" />
              </div>
              <span className="text-[11px] text-muted-foreground">Upload</span>
            </Button>
          </div>
        </div>

        {/* Content Area */}
        {activeView === "tracks" && (
          <div className="w-[250px] bg-background border-t border-border">
            <div className="h-14 flex items-center px-4">
              <span className="text-sm font-medium text-foreground">
                Tracks
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md ml-auto hover:bg-muted"
                onClick={onAddTrack}
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>

            <ScrollArea className="h-[calc(100vh-7rem)]">
              <div className="p-3 space-y-1">
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    className="group px-2 py-2 rounded-lg hover:bg-muted/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-0.5 h-[18px] ${track.color} rounded-full`}
                        />
                        <span className="text-xs font-medium text-foreground">
                          {track.name}
                        </span>
                        {(track.audioFile || track.audioBlob) && (
                          <FileAudio className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onMuteToggle(track.id)}
                          className="h-7 w-7 rounded-md hover:bg-muted"
                        >
                          <Volume2
                            className={`h-3.5 w-3.5 ${
                              track.muted
                                ? "text-muted-foreground/60"
                                : "text-muted-foreground"
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                    <div className="px-3">
                      <Slider
                        value={[track.volume]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(value) =>
                          onVolumeChange(track.id, value[0])
                        }
                        className={track.muted ? "opacity-50" : ""}
                      />
                    </div>
                    
                    {(track.audioFile || track.audioBlob) && (
                      <div className="px-3 mt-2">
                        <AudioPlayer
                          audioFile={track.audioFile}
                          audioBlob={track.audioBlob}
                          volume={track.volume}
                          muted={track.muted}
                          trackId={track.id}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {activeView === "record" && (
          <RecordingComponent
            onRecordingComplete={onRecordingComplete}
            onCancel={() => setActiveView(null)}
          />
        )}

        {activeView === "upload" && (
          <FileUpload
            onFileUpload={onFileUpload}
            onCancel={() => setActiveView(null)}
          />
        )}
      </div>
    </div>
  );
}
