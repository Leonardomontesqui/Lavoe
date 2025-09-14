"use client";

import { useState, useRef, useEffect } from "react";
import BeatHeader from "@/components/beat/BeatHeader";
import BeatTimeline from "@/components/beat/BeatTimeline";
import AiSidebar from "@/components/beat/AiSidebar";
import { TracksSidebar } from "@/components/beat/TracksSidebar";
import { MusicBlock, Track } from "@/components/beat/types";

const initialTracks: Track[] = [
  {
    id: "track-1",
    name: "Melody",
    color: "bg-blue-600",
    muted: false,
    volume: 75,
  },
  {
    id: "track-2",
    name: "Bass",
    color: "bg-cyan-500",
    muted: false,
    volume: 75,
  },
  {
    id: "track-3",
    name: "Drums",
    color: "bg-violet-600",
    muted: false,
    volume: 75,
  },
  {
    id: "track-4",
    name: "Percussion",
    color: "bg-pink-500",
    muted: false,
    volume: 75,
  },
];

const initialBlocks: MusicBlock[] = [];

const TIMELINE_WIDTH = 800;
const TIMELINE_MEASURES = 64; // measures instead of seconds
const PIXELS_PER_MEASURE = TIMELINE_WIDTH / TIMELINE_MEASURES;

export default function BeatMaker() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [bpm, setBpm] = useState(160);
  const [blocks, setBlocks] = useState<MusicBlock[]>(initialBlocks);
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [insertionPoint, setInsertionPoint] = useState<{time: number, trackIndex: number} | null>(null);
  const [tracksRefreshTrigger, setTracksRefreshTrigger] = useState(0);
  const [isGeneratingTrack, setIsGeneratingTrack] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [justResumed, setJustResumed] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const trackAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Initialize Web Audio API
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startPlayback = async () => {
    if (!isPlaying) {
      console.log('🎵 Starting playback...');
      console.log('Tracks:', tracks.length);
      console.log('Tracks with audio:', tracks.filter(t => t.audioFile || t.audioBlob));
      console.log('Audio refs map size:', trackAudioRefs.current.size);
      console.log('Current time:', currentTime);
      
      // Initialize audio context with user gesture
      if (audioContextRef.current?.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          console.log('✅ Audio context resumed');
        } catch (error) {
          console.error('❌ Failed to resume audio context:', error);
        }
      }
      
      setIsPlaying(true);
      setJustResumed(true);
      
      // Audio will be triggered by blocks during timeline progression
      console.log(`🎵 Playback started, justResumed set to true`);
      console.log(`🎵 Current blocks:`, blocks.map(b => ({ name: b.name, startTime: b.startTime, duration: b.duration, track: b.track })));
      console.log(`🎵 Current tracks:`, tracks.map(t => ({ name: t.name, id: t.id, hasAudio: !!(t.audioFile || t.audioBlob) })));
      
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const newTime = prev + 0.25; // quarter beat increments
          
          // Log timeline progress every measure
          if (newTime % 4 === 0) {
            console.log(`⏰ Timeline: ${newTime} measures, ${blocks.length} blocks total`);
          }
          
          // Check if any blocks should start playing at this time
          blocks.forEach((block, blockIndex) => {
            const track = tracks[block.track];
            if (track && (track.audioFile || track.audioBlob) && !track.muted) {
              const audioElement = trackAudioRefs.current.get(track.id);
              
              if (audioElement) {
                // Check if cursor is in this block
                const isInBlock = newTime >= block.startTime && newTime < (block.startTime + block.duration);
                const wasBeforeBlock = prev < block.startTime;
                const justEnteredBlock = wasBeforeBlock && isInBlock;
                
                // Check if resuming playback while in block
                const resumingInBlock = justResumed && isInBlock;
                
                // Check if starting playback and cursor is already in block
                const startingInBlock = prev === 0 && isInBlock;
                
                // Debug logging when near block
                if (Math.abs(newTime - block.startTime) <= 1) {
                  console.log(`🔍 Block "${block.name}": start=${block.startTime}, current=${newTime}, prev=${prev}`);
                  console.log(`🔍 justEnteredBlock=${justEnteredBlock}, resumingInBlock=${resumingInBlock}, startingInBlock=${startingInBlock}`);
                  console.log(`🔍 isInBlock=${isInBlock}, wasBeforeBlock=${wasBeforeBlock}, justResumed=${justResumed}`);
                }
                
                if (justEnteredBlock || resumingInBlock || startingInBlock) {
                  console.log(`🎶 TRIGGERING AUDIO for Block "${block.name}" on track ${block.track}`);
                  console.log(`🎶 Trigger reason: justEnteredBlock=${justEnteredBlock}, resumingInBlock=${resumingInBlock}, startingInBlock=${startingInBlock}`);
                  
                  // Calculate correct audio position based on timeline position within the block
                  const timeIntoBlock = newTime - block.startTime;
                  const secondsPerMeasure = 60 / bpm * 4; // 4 beats per measure at current BPM
                  const audioPosition = timeIntoBlock * secondsPerMeasure;
                  
                  // Set audio to correct position (or 0 for new entries)
                  if (resumingInBlock && audioPosition > 0) {
                    // When jumping to middle of block, start audio at correct position
                    audioElement.currentTime = Math.max(0, Math.min(audioPosition, audioElement.duration || 0));
                  } else {
                    // When entering block normally, start from beginning
                    audioElement.currentTime = 0;
                  }
                  
                  audioElement.volume = track.volume / 100;
                  
                  // Force immediate play
                  try {
                    const playPromise = audioElement.play();
                    if (playPromise !== undefined) {
                      playPromise.then(() => {
                        console.log(`✅ PLAYING "${block.name}" successfully`);
                      }).catch(error => {
                        console.error(`❌ FAILED to play "${block.name}":`, error);
                      });
                    }
                  } catch (error) {
                    console.error(`❌ IMMEDIATE FAIL "${block.name}":`, error);
                  }
                }
                
                // Check if blue line just exited this block
                const wasInBlock = prev >= block.startTime && prev < (block.startTime + block.duration);
                const isAfterBlock = newTime >= (block.startTime + block.duration);
                
                if (wasInBlock && isAfterBlock) {
                  console.log(`⏹️ Blue line exited block "${block.name}" on track ${block.track} at time ${newTime}`);
                  audioElement.pause();
                  audioElement.currentTime = 0;
                }
              } else {
                console.warn(`⚠️ No audio element found for track ${track.id} (block: ${block.name})`);
              }
            }
          });
          
          // Clear the justResumed flag after the first tick
          if (justResumed) {
            console.log(`🔄 Clearing justResumed flag after first tick`);
            setJustResumed(false);
          }
          
          return newTime >= TIMELINE_MEASURES ? 0 : newTime;
        });
      }, (60 / bpm / 4) * 1000); // quarter note timing based on BPM
    }
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setJustResumed(false); // Reset resume flag when stopping
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Pause all track audio
    trackAudioRefs.current.forEach(audioElement => {
      audioElement.pause();
    });
    
    console.log(`⏸️ Playback stopped, justResumed reset to false`);
  };

  const resetPlayback = () => {
    stopPlayback();
    setCurrentTime(0);
    
    // Reset all track audio to beginning
    trackAudioRefs.current.forEach(audioElement => {
      if (audioElement.duration && isFinite(audioElement.duration)) {
        audioElement.currentTime = 0;
      }
    });
    
    setJustResumed(true); // Trigger audio check for position 0
  };

  const fastForward = () => {
    const skipAmount = 8; // Skip forward 8 measures
    const newTime = Math.min(currentTime + skipAmount, TIMELINE_MEASURES - 1);
    
    // Stop all currently playing audio
    trackAudioRefs.current.forEach(audioElement => {
      audioElement.pause();
      audioElement.currentTime = 0;
    });
    
    setCurrentTime(newTime);
    
    // If playing, immediately check for blocks at new position and start audio
    if (isPlaying) {
      setTimeout(() => {
        blocks.forEach(block => {
          const track = tracks[block.track];
          if (track && (track.audioFile || track.audioBlob) && !track.muted) {
            const audioElement = trackAudioRefs.current.get(track.id);
            const isInBlock = newTime >= block.startTime && newTime < (block.startTime + block.duration);
            
            if (audioElement && isInBlock) {
              // Calculate correct audio position
              const timeIntoBlock = newTime - block.startTime;
              const secondsPerMeasure = 60 / bpm * 4;
              const audioPosition = timeIntoBlock * secondsPerMeasure;
              
              audioElement.currentTime = Math.max(0, Math.min(audioPosition, audioElement.duration || 0));
              audioElement.volume = track.volume / 100;
              audioElement.play().catch(console.error);
              console.log(`🎶 Started audio for "${block.name}" at position ${audioElement.currentTime}s`);
            }
          }
        });
      }, 50); // Small delay to ensure state update
    }
    
    console.log(`⏩ Fast forward to time ${newTime}`);
  };

  const rewind = () => {
    const skipAmount = 8; // Skip backward 8 measures
    const newTime = Math.max(currentTime - skipAmount, 0);
    
    // Stop all currently playing audio
    trackAudioRefs.current.forEach(audioElement => {
      audioElement.pause();
      audioElement.currentTime = 0;
    });
    
    setCurrentTime(newTime);
    
    // If playing, immediately check for blocks at new position and start audio
    if (isPlaying) {
      setTimeout(() => {
        blocks.forEach(block => {
          const track = tracks[block.track];
          if (track && (track.audioFile || track.audioBlob) && !track.muted) {
            const audioElement = trackAudioRefs.current.get(track.id);
            const isInBlock = newTime >= block.startTime && newTime < (block.startTime + block.duration);
            
            if (audioElement && isInBlock) {
              // Calculate correct audio position
              const timeIntoBlock = newTime - block.startTime;
              const secondsPerMeasure = 60 / bpm * 4;
              const audioPosition = timeIntoBlock * secondsPerMeasure;
              
              audioElement.currentTime = Math.max(0, Math.min(audioPosition, audioElement.duration || 0));
              audioElement.volume = track.volume / 100;
              
              // Use Promise.resolve to ensure all tracks can play simultaneously
              Promise.resolve().then(() => {
                return audioElement.play();
              }).then(() => {
                console.log(`🎶 Started audio for "${block.name}" on track ${block.track} at position ${audioElement.currentTime}s`);
              }).catch(error => {
                console.error(`❌ Failed to play "${block.name}" on track ${block.track}:`, error);
              });
            }
          }
        });
      }, 50); // Small delay to ensure state update
    }
    
    console.log(`⏪ Rewind to time ${newTime}`);
  };

  const exportTimeline = async () => {
    try {
      console.log('🎵 Starting timeline export...');
      
      // Create an offline audio context for rendering
      const sampleRate = 44100;
      const timelineDurationInSeconds = (TIMELINE_MEASURES * 60 / bpm * 4); // Convert measures to seconds
      const offlineContext = new OfflineAudioContext(2, sampleRate * timelineDurationInSeconds, sampleRate);
      
      const blockPositions: { buffer: AudioBuffer; startTime: number }[] = [];
      
      // Load all audio files and decode them
      for (const block of blocks) {
        const track = tracks[block.track];
        if (track && (track.audioFile || track.audioBlob) && !track.muted) {
          try {
            const audioData = track.audioFile ? 
              await track.audioFile.arrayBuffer() : 
              await track.audioBlob!.arrayBuffer();
            
            const audioBuffer = await offlineContext.decodeAudioData(audioData);
            
            // Calculate start time in seconds
            const startTimeInSeconds = (block.startTime * 60 / bpm * 4);
            
            blockPositions.push({
              buffer: audioBuffer,
              startTime: startTimeInSeconds
            });
            
            console.log(`📁 Loaded "${block.name}" for export`);
          } catch (error) {
            console.error(`❌ Failed to load audio for "${block.name}":`, error);
          }
        }
      }
      
      // Create audio sources and schedule them
      blockPositions.forEach(({ buffer, startTime }) => {
        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start(startTime);
      });
      
      console.log('🎵 Rendering timeline...');
      
      // Render the audio
      const renderedBuffer = await offlineContext.startRendering();
      
      // Convert to WAV and download
      const wavBlob = audioBufferToWav(renderedBuffer);
      const url = URL.createObjectURL(wavBlob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `lavoe-timeline-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('✅ Timeline exported successfully!');
      
    } catch (error) {
      console.error('❌ Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  // Helper function to convert AudioBuffer to WAV
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  const handleBlockClick = (blockId: string) => {
    setSelectedBlock(selectedBlock === blockId ? null : blockId);
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;

    // Handle Agent mode - simulate AI generation (existing behavior)
    const newBlock: MusicBlock = {
      id: `ai-block-${Date.now()}`,
      name: aiPrompt,
      type: "melody",
      color: "bg-emerald-500",
      startTime: Math.floor(Math.random() * 48),
      duration: 8 + Math.floor(Math.random() * 16),
      track: Math.floor(Math.random() * tracks.length),
    };

    setBlocks((prev) => [...prev, newBlock]);
    setAiPrompt("");
  };

  const generateBeatovenTrack = async (prompt: string) => {
    try {
      setIsGeneratingTrack(true);
      setGenerationStatus("Starting track generation...");

      // Start track generation
      const response = await fetch("http://localhost:8000/start_track_generation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: { text: prompt },
          format: "mp3",
          looping: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start track generation");
      }

      const result = await response.json();
      const taskId = result.task_id;

      setAiPrompt("");
      setGenerationStatus("Track generation in progress...");

      // Start polling for completion
      pollForTrackCompletion(taskId, prompt);

    } catch (error) {
      console.error("Error generating track:", error);
      setIsGeneratingTrack(false);
      setGenerationStatus("");
    }
  };

  const pollForTrackCompletion = async (taskId: string, originalPrompt: string) => {
    const maxAttempts = 60; // 10 minutes max (60 * 10 seconds)
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;

        const response = await fetch(`http://localhost:8000/get_generated_track?task_id=${taskId}`);

        if (!response.ok) {
          throw new Error("Failed to check track status");
        }

        const result = await response.json();

        if (result.status === "composed") {
          // Track generation completed - the tracks are now stored in our system
          console.log("Track generation completed:", result);
          setGenerationStatus("Track generation completed! Check the Tracks tab.");
          setIsGeneratingTrack(false);
          // Trigger tracks refresh
          setTracksRefreshTrigger(prev => prev + 1);

          // Clear status after a few seconds
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);

          return;
        } else if (result.status === "running" || result.status === "composing") {
          // Still processing
          setGenerationStatus(`Track generation in progress... (${attempts}/${maxAttempts})`);
          if (attempts < maxAttempts) {
            setTimeout(poll, 10000); // Poll every 10 seconds
          } else {
            console.error("Track generation timed out");
            setGenerationStatus("Track generation timed out. Please try again.");
            setIsGeneratingTrack(false);
            setTimeout(() => {
              setGenerationStatus("");
            }, 5000);
          }
        } else {
          // Unknown status or error
          console.error("Unexpected track generation status:", result.status);
          setGenerationStatus(`Unexpected status: ${result.status}`);
          setIsGeneratingTrack(false);
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);
        }
      } catch (error) {
        console.error("Error polling track status:", error);
        setGenerationStatus("Error checking track status. Retrying...");
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Retry after 10 seconds
        } else {
          setIsGeneratingTrack(false);
          setGenerationStatus("Failed to check track status. Please try again.");
          setTimeout(() => {
            setGenerationStatus("");
          }, 5000);
        }
      }
    };

    // Start polling
    poll();
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleVolumeChange = (trackId: string, volume: number) => {
    setTracks(
      tracks.map((track) =>
        track.id === trackId ? { ...track, volume } : track
      )
    );
  };

  const handleMuteToggle = (trackId: string) => {
    setTracks(
      tracks.map((track) =>
        track.id === trackId ? { ...track, muted: !track.muted } : track
      )
    );
  };

  const addTrack = () => {
    const trackColors = [
      "bg-blue-600",
      "bg-cyan-500", 
      "bg-violet-600",
      "bg-pink-500",
      "bg-emerald-500",
      "bg-orange-500",
      "bg-red-500",
      "bg-yellow-500",
      "bg-indigo-500",
      "bg-purple-500"
    ];
    
    const trackNames = [
      "Melody",
      "Bass", 
      "Drums",
      "Percussion",
      "Lead",
      "Pad",
      "Arp",
      "FX",
      "Vocals",
      "Strings"
    ];
    
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: trackNames[tracks.length % trackNames.length],
      color: trackColors[tracks.length % trackColors.length],
      muted: false,
      volume: 75,
    };
    
    setTracks((prev) => [...prev, newTrack]);
  };

  const handleFileUpload = async (file: File) => {
    try {
      // First, upload the file to the backend storage system
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:8000/upload-audio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('File uploaded to storage:', result);

      // Trigger tracks list refresh to show the uploaded file
      setTracksRefreshTrigger(prev => prev + 1);

      // Also create local track and block for the timeline editor
      const trackColors = [
        "bg-blue-600",
        "bg-cyan-500",
        "bg-violet-600",
        "bg-pink-500",
        "bg-emerald-500",
        "bg-orange-500",
        "bg-red-500",
        "bg-yellow-500",
        "bg-indigo-500",
        "bg-purple-500"
      ];

      // Extract filename without extension for track name
      const fileName = file.name.split('.')[0];
      const trackId = `track-${Date.now()}`;

      const newTrack: Track = {
        id: trackId,
        name: fileName,
        color: trackColors[tracks.length % trackColors.length],
        muted: false,
        volume: 75,
        audioFile: file, // Store the file reference for local playback
      };

      setTracks((prev) => [...prev, newTrack]);

      // Create audio element for timeline playback
      const audioElement = new Audio(URL.createObjectURL(file));
      audioElement.loop = false;
      audioElement.preload = 'metadata';
      trackAudioRefs.current.set(trackId, audioElement);

      // Create a music block at the start of the timeline (time 0)
      // Duration will be set once audio metadata loads
      const newBlock: MusicBlock = {
        id: `block-${Date.now()}`,
        name: fileName,
        type: "melody",
        color: trackColors[tracks.length % trackColors.length],
        startTime: 0, // Always start at beginning
        duration: 8, // Temporary duration, will be updated
        track: tracks.length, // Use the new track index
      };

      setBlocks((prev) => [...prev, newBlock]);

      // Update block duration once audio metadata loads
      audioElement.addEventListener('loadedmetadata', () => {
        const audioDurationInMeasures = (audioElement.duration / 60) * (160 / 4); // Convert to measures based on BPM
        setBlocks(prevBlocks =>
          prevBlocks.map(block =>
            block.id === newBlock.id
              ? { ...block, duration: Math.max(1, audioDurationInMeasures) }
              : block
          )
        );
      });

    } catch (error) {
      console.error('Error uploading file:', error);
      // Could add toast notification here for better UX
    }
  };

  const handleRecordingComplete = async (audioBlob: Blob) => {
    try {
      // First, upload the recording to the backend storage system
      const trackName = `Recording ${tracks.length + 1}`;
      const formData = new FormData();
      formData.append('file', audioBlob, `${trackName}.wav`);

      const response = await fetch('http://localhost:8000/upload-audio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Recording uploaded to storage:', result);

      // Trigger tracks list refresh to show the uploaded recording
      setTracksRefreshTrigger(prev => prev + 1);

      // Also create local track and block for the timeline editor
      const trackColors = [
        "bg-blue-600",
        "bg-cyan-500",
        "bg-violet-600",
        "bg-pink-500",
        "bg-emerald-500",
        "bg-orange-500",
        "bg-red-500",
        "bg-yellow-500",
        "bg-indigo-500",
        "bg-purple-500"
      ];

      const trackColor = trackColors[tracks.length % trackColors.length];
      const trackId = `track-${Date.now()}`;

      const newTrack: Track = {
        id: trackId,
        name: trackName,
        color: trackColor,
        muted: false,
        volume: 75,
        audioBlob: audioBlob, // Store the blob reference for local playback
      };

      setTracks((prev) => [...prev, newTrack]);

      // Create audio element for timeline playback
      const audioElement = new Audio(URL.createObjectURL(audioBlob));
      audioElement.loop = false;
      audioElement.preload = 'metadata';

      // Add comprehensive event listeners for debugging
      audioElement.addEventListener('loadedmetadata', () => {
        console.log(`📊 Audio metadata loaded for ${trackName}:`, {
          duration: audioElement.duration,
          readyState: audioElement.readyState
        });
      });

      audioElement.addEventListener('canplay', () => {
        console.log(`▶️ Audio can play: ${trackName}`);
      });

      audioElement.addEventListener('error', (e) => {
        console.error(`❌ Audio error for ${trackName}:`, e);
      });

      trackAudioRefs.current.set(trackId, audioElement);
      console.log(`🎤 Created audio element for ${trackName}:`, {
        trackId,
        src: audioElement.src.substring(0, 50) + '...',
        preload: audioElement.preload
      });

      // Create a music block at the start of the timeline (time 0)
      // Duration will be set once audio metadata loads
      const newBlock: MusicBlock = {
        id: `block-${Date.now()}`,
        name: trackName,
        type: "melody",
        color: trackColor,
        startTime: 0, // Always start at beginning
        duration: 8, // Temporary duration, will be updated
        track: tracks.length, // Use the new track index
      };

      setBlocks((prev) => [...prev, newBlock]);

      // Update block duration once audio metadata loads
      audioElement.addEventListener('loadedmetadata', () => {
        const audioDurationInMeasures = (audioElement.duration / 60) * (bpm / 4); // Convert to measures based on BPM
        setBlocks(prevBlocks =>
          prevBlocks.map(block =>
            block.id === newBlock.id
              ? { ...block, duration: Math.max(1, audioDurationInMeasures) }
              : block
          )
        );
      });

    } catch (error) {
      console.error('Error uploading recording:', error);
      // Could add toast notification here for better UX
    }
  };

  const handleAddTrackToEditor = async (trackId: string, filename: string) => {
    try {
      // Download the track from the backend
      const response = await fetch(`http://localhost:8000/tracks/${trackId}/download`);
      if (!response.ok) {
        throw new Error("Failed to download track");
      }

      const audioBlob = await response.blob();
      const audioFile = new File([audioBlob], filename, { type: audioBlob.type });

      // Create a track from the downloaded file
      const trackColors = [
        "bg-blue-600",
        "bg-cyan-500",
        "bg-violet-600",
        "bg-pink-500",
        "bg-emerald-500",
        "bg-orange-500",
        "bg-red-500",
        "bg-yellow-500",
        "bg-indigo-500",
        "bg-purple-500"
      ];

      // Extract filename without extension for track name
      const fileName = filename.split('.')[0];
      const localTrackId = `track-${Date.now()}`;

      const newTrack: Track = {
        id: localTrackId,
        name: fileName,
        color: trackColors[tracks.length % trackColors.length],
        muted: false,
        volume: 75,
        audioFile: audioFile, // Store the file reference for local playback
      };

      setTracks((prev) => [...prev, newTrack]);

      // Create audio element for timeline playback
      const audioElement = new Audio(URL.createObjectURL(audioFile));
      audioElement.loop = false;
      audioElement.preload = 'metadata';
      trackAudioRefs.current.set(localTrackId, audioElement);

      // Create a music block at the start of the timeline (time 0)
      // Duration will be set once audio metadata loads
      const newBlock: MusicBlock = {
        id: `block-${Date.now()}`,
        name: fileName,
        type: "melody",
        color: trackColors[tracks.length % trackColors.length],
        startTime: 0, // Always start at beginning
        duration: 8, // Temporary duration, will be updated
        track: tracks.length, // Use the new track index
      };

      setBlocks((prev) => [...prev, newBlock]);

      // Update block duration once audio metadata loads
      audioElement.addEventListener('loadedmetadata', () => {
        const audioDurationInMeasures = (audioElement.duration / 60) * (bpm / 4); // Convert to measures based on BPM
        setBlocks(prevBlocks =>
          prevBlocks.map(block =>
            block.id === newBlock.id
              ? { ...block, duration: Math.max(1, audioDurationInMeasures) }
              : block
          )
        );
      });

      console.log(`Added track "${filename}" to editor`);

    } catch (error) {
      console.error('Error adding track to editor:', error);
      // Could add toast notification here for better UX
    }
  };

  // Timeline click no longer needed for insertion points
  const handleTimelineClick = (time: number, trackIndex: number) => {
    // Could be used for other timeline interactions in the future
  };

  const handleTimeChange = (time: number) => {
    setCurrentTime(time);
  };

  const handleBlockMove = (blockId: string, newTime: number, newTrackIndex: number) => {
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === blockId 
          ? { ...block, startTime: newTime, track: newTrackIndex }
          : block
      )
    );
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="border-r border-border">
        <TracksSidebar
          tracks={tracks}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
          onAddTrack={addTrack}
          onFileUpload={handleFileUpload}
          onRecordingComplete={handleRecordingComplete}
        />
      </div>
      <div className="flex-1 flex flex-col">
        <BeatHeader
          bpm={bpm}
          isPlaying={isPlaying}
          onStart={startPlayback}
          onStop={stopPlayback}
          onReset={resetPlayback}
          onFastForward={fastForward}
          onRewind={rewind}
          onExport={exportTimeline}
        />
        <BeatTimeline
          currentTime={currentTime}
          blocks={blocks}
          tracks={tracks}
          selectedBlock={selectedBlock}
          onBlockClick={handleBlockClick}
          onTimelineClick={handleTimelineClick}
          onTimeChange={handleTimeChange}
          onBlockMove={handleBlockMove}
          insertionPoint={insertionPoint}
          totalMeasures={TIMELINE_MEASURES}
        />
      </div>
      <AiSidebar
        aiPrompt={aiPrompt}
        setAiPrompt={setAiPrompt}
        onSubmit={handleAIGenerate}
        tracksRefreshTrigger={tracksRefreshTrigger}
        isGeneratingTrack={isGeneratingTrack}
        generationStatus={generationStatus}
        onAddTrackToEditor={handleAddTrackToEditor}
      />
    </div>
  );
}
