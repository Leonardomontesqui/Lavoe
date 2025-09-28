import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { NextRequest } from 'next/server';

// Backend API base URL - adjust this to match your backend server
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// Tool definitions that map to your Python backend endpoints
const extractHarmonics = tool({
  description: 'Extract harmonic components from audio using librosa HPSS. This isolates vocals and harmonic instruments from the audio.',
  inputSchema: z.object({
    audioData: z.string().describe('Base64 encoded audio data'),
    filename: z.string().optional().describe('Original filename for reference'),
  }),
  execute: async (params: { audioData: string; filename?: string }) => {
    const { audioData, filename = 'audio.wav' } = params;
    
    try {
      // Validate base64 audio data
      if (!audioData || typeof audioData !== 'string') {
        throw new Error('Invalid audio data provided');
      }
      
      const response = await fetch(`${BACKEND_URL}/extract-harmonics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_data: audioData,
          filename: filename,
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Backend error: ${error}`);
      }

      const result = await response.json();
      return {
        success: true,
        audioData: result.audio_data,
        filename: result.filename,
        metadata: result.metadata,
        message: `Successfully extracted harmonic components. Duration: ${result.metadata.duration_seconds.toFixed(2)}s, Sample rate: ${result.metadata.sample_rate}Hz`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Failed to extract harmonic components from the audio.',
      };
    }
  },
});

const processReverb = tool({
  description: 'Apply reverb effect to audio using Pedalboard. Adds spatial depth and ambience to the sound.',
  inputSchema: z.object({
    audioData: z.string().describe('Base64 encoded audio data'),
    filename: z.string().optional().describe('Original filename for reference'),
    roomSize: z.number().min(0).max(1).default(0.5).describe('Size of the reverb room (0.0 to 1.0)'),
    damping: z.number().min(0).max(1).default(0.5).describe('High frequency damping (0.0 to 1.0)'),
    wetLevel: z.number().min(0).max(1).default(0.3).describe('Reverb effect level (0.0 to 1.0)'),
    dryLevel: z.number().min(0).max(1).default(0.7).describe('Original signal level (0.0 to 1.0)'),
  }),
  execute: async (params: { audioData: string; filename?: string; roomSize: number; damping: number; wetLevel: number; dryLevel: number }) => {
    const { audioData, filename = 'audio.wav', roomSize, damping, wetLevel, dryLevel } = params;
    
    try {
      // Validate base64 audio data
      if (!audioData || typeof audioData !== 'string') {
        throw new Error('Invalid audio data provided');
      }
      
      const response = await fetch(`${BACKEND_URL}/process-reverb`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_data: audioData,
          filename: filename,
          room_size: roomSize,
          damping: damping,
          wet_level: wetLevel,
          dry_level: dryLevel,
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Backend error: ${error}`);
      }

      const result = await response.json();
      return {
        success: true,
        audioData: result.audio_data,
        filename: result.filename,
        metadata: result.metadata,
        message: `Successfully applied reverb effect. Room size: ${roomSize}, Damping: ${damping}, Wet: ${wetLevel}, Dry: ${dryLevel}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Failed to apply reverb effect to the audio.',
      };
    }
  },
});

const chopAudio = tool({
  description: 'Chop audio into segments using harmonic component analysis and onset detection. Creates multiple audio segments based on musical onsets.',
  inputSchema: z.object({
    audioData: z.string().describe('Base64 encoded audio data'),
    filename: z.string().optional().describe('Original filename for reference'),
    defaultLength: z.number().min(0.1).max(10).default(1.8).describe('Default length for chops in seconds'),
    minDuration: z.number().min(0.05).max(2).default(0.2).describe('Minimum duration for chops in seconds'),
    nClusters: z.number().min(1).max(20).default(6).describe('Number of clusters for grouping similar chops'),
  }),
  execute: async (params: { audioData: string; filename?: string; defaultLength: number; minDuration: number; nClusters: number }) => {
    const { audioData, filename = 'audio.wav', defaultLength, minDuration, nClusters } = params;
    
    try {
      // Validate base64 audio data
      if (!audioData || typeof audioData !== 'string') {
        throw new Error('Invalid audio data provided');
      }
      
      const response = await fetch(`${BACKEND_URL}/chop-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_data: audioData,
          filename: filename,
          default_length: defaultLength,
          min_duration: minDuration,
          n_clusters: nClusters,
        }),
        signal: AbortSignal.timeout(60000), // 60 second timeout for chopping
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Backend error: ${error}`);
      }

      const result = await response.json();
      return {
        success: true,
        chops: result.chops,
        metadata: result.metadata,
        message: `Successfully chopped audio into ${result.metadata.total_chops} segments. Found ${result.metadata.onset_detection.onsets_detected} onsets.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Failed to chop the audio into segments.',
      };
    }
  },
});

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages format', { status: 400 });
    }

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages,
      tools: {
        extractHarmonics,
        processReverb,
        chopAudio,
      },
      system: `You are Lavoe, an AI audio processing assistant specialized in music production and beat making. You have access to powerful audio processing tools that can:

1. **Extract Harmonics** - Isolate harmonic components (vocals, melodic instruments) from audio using librosa HPSS
2. **Process Reverb** - Add spatial reverb effects with customizable room size, damping, and wet/dry levels
3. **Chop Audio** - Intelligently segment audio into chops based on harmonic onset detection and clustering

**Instructions:**
- Always be helpful and explain what each tool does
- When users upload audio, suggest appropriate processing based on their goals
- For beat making, chopping is often the most useful starting point
- Explain the parameters and their effects when using tools
- If a tool fails, provide clear feedback and suggest alternatives
- You can chain operations (e.g., extract harmonics first, then chop the result)
- Always describe the results in musical terms that producers understand

**Audio Format:**
- All audio should be provided as Base64 encoded data
- Supported formats: WAV, MP3, FLAC (converted to WAV for processing)
- Results are returned as Base64 encoded WAV files

**Workflow Tips:**
- For vocal samples: Extract harmonics first, then apply reverb or chop
- For drum loops: Chop directly to create individual hits
- For melodic content: Extract harmonics, then chop for melodic segments
- Experiment with different chop lengths and cluster counts for variety

Be conversational, knowledgeable about music production, and always ready to help create amazing beats!`,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }), 
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}
