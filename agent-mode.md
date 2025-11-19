# Agentic Mode Architecture

A guide to understanding and replicating Lavoe's AI agent system for music production.

## Overview

Lavoe uses **Vercel AI SDK** to create an AI assistant that can manipulate a DAW timeline through natural language. The agent can move blocks, chop audio, adjust speed, and loop tracks while maintaining awareness of the current composition state.

## Tech Stack

**Frontend:**
- `ai` (Vercel AI SDK) - Core agentic framework
- `@ai-sdk/cohere`, `@ai-sdk/openai`, `@ai-sdk/google` - Model providers
- `@ai-sdk/react` - React hooks (`useChat`)
- `zod` - Tool parameter validation

**Backend:**
- FastAPI - Python web server
- librosa - Audio analysis & processing
- scikit-learn - Clustering for intelligent chopping
- Supabase Storage - Track persistence

## Architecture Flow

```
User Input (AiSidebar)
    ↓
POST /api/agent-chat (Frontend route)
    ↓
streamText() with tools (Vercel AI SDK)
    ↓
AI Model generates tool call
    ↓
onToolCall handler (Client-side)
    ↓
├─ Simple tools: Direct state update (move, loop)
└─ Complex tools: Backend processing (chop, speed)
    ↓
Backend /process/* endpoints
    ↓
Audio processing (librosa, clustering)
    ↓
Store results in Supabase
    ↓
Client downloads & updates timeline
```

## Key Implementation Files

### 1. Agent Chat API Route
**`frontend/app/api/agent-chat/route.ts`**

```typescript
export async function POST(req: Request) {
  const { messages, blocks, model } = await req.json();

  // Select AI provider
  const selectedModel = model === "command-A-03"
    ? cohere("command-a-03-2025")
    : openai("gpt-4o-mini");

  // Stream with tools
  const result = streamText({
    model: selectedModel,
    messages,
    system: `You are a music production assistant. Current timeline: ${JSON.stringify(blocks)}`,
    tools: {
      moveBlock: { ... },
      chopAudio: { ... },
      adjustSpeed: { ... },
      loop: { ... }
    }
  });

  return result.toDataStreamResponse();
}
```

### 2. Client-Side Tool Handler
**`frontend/components/beat/AiSidebar.tsx`**

```typescript
const { messages, addToolResult } = useChat({
  api: '/api/agent-chat',
  body: { blocks, model },

  onToolCall: async ({ toolCall }) => {
    switch (toolCall.toolName) {
      case 'chopAudio':
        // Call backend
        const res = await fetch('/api/process/chop-audio', {
          method: 'POST',
          body: JSON.stringify({ track_id, ...params })
        });
        const { chop_track_ids } = await res.json();

        // Download and add to timeline
        await onAddChopsToEditor(chop_track_ids);

        return `Chopped into ${chop_track_ids.length} pieces`;

      case 'moveBlock':
        // Direct state update
        onBlockMove(blockId, newStartTime);
        return 'Block moved';
    }
  }
});
```

### 3. Backend Audio Processing
**`backend/server.py`**

```python
@app.post("/process/chop-audio")
async def chop_audio(request: ChopAudioRequest):
    # Download track
    audio_data = download_track_from_supabase(request.track_id)
    y, sr = librosa.load(io.BytesIO(audio_data))

    # Harmonic-Percussive Source Separation
    y_harmonic, _ = librosa.effects.hpss(y)

    # Detect onsets
    onset_frames = librosa.onset.onset_detect(y=y_harmonic, sr=sr)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)

    # Extract features for each segment
    features = []
    for i in range(len(onset_times) - 1):
        segment = y[start:end]
        rms = librosa.feature.rms(y=segment)
        centroid = librosa.feature.spectral_centroid(y=segment, sr=sr)
        chroma = librosa.feature.chroma_stft(y=segment, sr=sr)
        features.append([rms.mean(), centroid.mean(), chroma.mean()])

    # Cluster and select best representatives
    kmeans = KMeans(n_clusters=request.n_clusters)
    labels = kmeans.fit_predict(features)

    # Save each chop as separate track
    chop_ids = []
    for segment in selected_chops:
        chop_id = upload_to_supabase(segment_audio)
        chop_ids.append(chop_id)

    return {"chop_track_ids": chop_ids}
```

## Key Patterns for Replication

### 1. Context-Aware System Prompt
Always include current state in the system prompt:
```typescript
system: `You are a music assistant. Timeline blocks: ${JSON.stringify(blocks)}`
```

### 2. Client-Side Tool Execution
Tools don't have server-side `execute` functions. Handle everything in `onToolCall`:
```typescript
tools: {
  myTool: {
    description: "Does something",
    parameters: z.object({ ... }),
    // No execute function - handled by onToolCall
  }
}
```

### 3. Hybrid Processing Model
- **Fast operations**: Update state directly (move, loop)
- **Heavy operations**: Offload to backend (chop, effects)

### 4. Track-Based Architecture
Everything becomes a referenceable track:
- Original uploads → tracks
- Processed audio → new tracks
- Chops → individual tracks

Each has a unique ID for later reference.

### 5. Visual Feedback States
Track operation progress:
- `input-streaming`: "Preparing..."
- `input-available`: "Processing..."
- `output-available`: "Complete!"
- `output-error`: Show error

## How to Replicate

1. **Install Vercel AI SDK**
   ```bash
   npm install ai @ai-sdk/openai @ai-sdk/cohere zod
   ```

2. **Create API Route** (`app/api/agent/route.ts`)
   - Accept messages + context (timeline state)
   - Define tools with Zod schemas
   - Use `streamText()` with your model
   - Return streaming response

3. **Setup Client Hook** (`useChat`)
   - Pass context in `body`
   - Implement `onToolCall` handler
   - Route simple tools to state updates
   - Route complex tools to backend APIs

4. **Build Backend Processors**
   - Create endpoints for heavy operations
   - Process audio/data
   - Store results (Supabase, S3, etc.)
   - Return identifiers for client retrieval

5. **Add Visual Feedback**
   - Track tool call states
   - Show progress indicators
   - Display results

## Multi-Model Support

Switch between providers easily:
```typescript
const model = modelName === "cohere"
  ? cohere("command-a-03-2025")
  : modelName === "gemini"
  ? google("gemini-2.5-flash")
  : openai("gpt-4o-mini");
```

## Audio Processing Pipeline

For music apps, the chopping algorithm is key:

1. **HPSS**: Separate harmonic/percussive components
2. **Onset Detection**: Find rhythmic boundaries
3. **Feature Extraction**: RMS, spectral centroid, chroma, MFCCs
4. **Clustering**: Group similar segments (KMeans)
5. **Selection**: Pick representatives from each cluster

This creates musically coherent chops rather than arbitrary slices.

## Storage Strategy

Use Supabase (or similar) for:
- Track uploads (user files)
- Generated tracks (AI beats)
- Processed tracks (effects, speed changes)
- Chops (individual segments)

Each operation creates a new track rather than mutating originals.

## Best Practices

1. **Always provide context**: Agent needs timeline state
2. **Validate with Zod**: Prevent invalid tool parameters
3. **Stream responses**: Better UX than waiting
4. **Store everything**: Don't lose processed audio
5. **Track states visually**: Users need feedback
6. **Support multiple models**: Different models excel at different tasks

---

Built with Vercel AI SDK v5 + Next.js 14 + FastAPI + librosa
