"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Volume2, Mic, Trash2, Upload, Menu } from "lucide-react";
import { Track } from "./types";
import { FileUpload } from "./FileUpload";
import { AudioPlayer } from "./AudioPlayer";
import { RecordingComponent } from "./RecordingComponent";
import { Waveform } from "./Waveform";
import { NavRail, type NavRailItemConfig } from "@/components/ui/nav-rail";

interface TracksSidebarProps {
  tracks: Track[];
  onVolumeChange: (trackId: string, volume: number) => void;
  onMuteToggle: (trackId: string) => void;
  onAddTrack: () => void;
  onFileUpload: (file: File) => void;
  onRecordingComplete: (audioBlob: Blob) => void;
  onDeleteTrack: (trackId: string) => void;
}

export function TracksSidebar({
  tracks,
  onVolumeChange,
  onMuteToggle,
  onAddTrack,
  onFileUpload,
  onRecordingComplete,
  onDeleteTrack,
}: TracksSidebarProps) {
  type ViewKey = "tracks" | "record" | "upload";
  const [activeView, setActiveView] = useState<ViewKey | null>(null);

  const navItems: NavRailItemConfig[] = [
    {
      key: "tracks",
      label: "Tracks",
      icon: Menu,
    },
    {
      key: "record",
      label: "Record",
      icon: Mic,
    },
    {
      key: "upload",
      label: "Upload",
      icon: Upload,
    },
  ];

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Main Container */}
      <div className="flex-1 flex">
        {/* Left Navigation */}
        <NavRail
          items={navItems}
          activeKey={activeView}
          onChange={(key) => setActiveView(key as ViewKey | null)}
        />

        {/* Content Area */}
        {activeView === "tracks" && (
          <div className="w-[250px] bg-background border-border">
            <div className="h-14 flex items-center px-4">
              <span className="text-sm font-medium text-foreground">
                Tracks
              </span>
            </div>

            <ScrollArea className="h-[calc(100vh-7rem)]">
              <div className="p-3 space-y-1">
                {tracks.length === 0 ? (
                  <div className="flex items-center justify-center h-[calc(100vh-12rem)] px-4">
                    <p className="text-sm text-muted-foreground text-center leading-relaxed">
                      Upload tracks or generate them to your catalog
                    </p>
                  </div>
                ) : (
                  tracks.map((track) => (
                    <div
                      key={track.id}
                      className="group px-2 py-2 rounded-lg hover:bg-muted/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <div
                            className={`w-0.5 h-[18px] ${track.color} rounded-full`}
                          />
                          {track.audioFile || track.audioBlob ? (
                            <div className="flex-1 max-w-[140px]">
                              <Waveform
                                audioFile={track.audioFile}
                                audioBlob={track.audioBlob}
                                width={140}
                                height={36}
                                color={track.color}
                                className="opacity-80"
                              />
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              No audio
                            </span>
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
                            onClick={() => onDeleteTrack(track.id)}
                            className="h-7 w-7 rounded-md hover:bg-muted hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
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
                  ))
                )}
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
