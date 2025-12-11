export interface MusicBlock {
  id: string;
  name: string;
  type: "melody" | "bass" | "drums" | "percussion";
  color: string;
  startTime: number;
  duration: number;
  track: number;
  trackId?: string; // ID of the associated track for AI agent use
  audioFile?: File; // Optional audio file for the block
  audioBlob?: Blob; // Optional audio blob for the block
  waveformData?: number[]; // Optional cached waveform data
}

export interface Track {
  id: string;
  name: string;
  color: string;
  muted: boolean;
  volume: number;
  audioFile?: File; // Optional audio file for uploaded tracks
  audioBlob?: Blob; // Optional audio blob for recorded tracks
  waveformData?: number[]; // Optional cached waveform data for performance
}

// AI Sidebar types
export interface ToolOperation {
  id: string;
  type: "moveBlock" | "chopAudio" | "adjustSpeed" | "loop" | "text";
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
    | "complete";
  input?: any;
  output?: string;
  errorText?: string;
  text?: string;
}

export interface EnhancedAIResponseProps {
  operations: ToolOperation[];
  isStreaming?: boolean;
  className?: string;
}

export interface ApiTrack {
  track_id: string;
  filename: string;
  file_size: number;
  created_at: string;
  duration_seconds?: number;
  sample_rate?: number;
  processing_type?: string;
  channels?: number;
}

export interface AiSidebarProps {
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  onSubmit: (mode?: "beat" | "agent", provider?: "beatoven" | "mubert") => void;
  tracksRefreshTrigger?: number;
  isGeneratingTrack?: boolean;
  generationStatus?: string;
  onAddTrackToEditor?: (trackId: string, filename: string) => void;
  blocks?: MusicBlock[];
  onBlockMove?: (blockId: string, newTime: number) => void;
  onAddChopsToEditor?: (chops: any[], originalTrackName: string) => void;
  onSpeedAdjust?: (blockId: string, speedFactor: number) => void;
  onLoop?: (blockId: string, times: number) => void;
  onAgentBusyChange?: (busy: boolean) => void;
  onNewTrack?: (track: ApiTrack) => void;
}
