# Vercel AI SDK Architecture: How It Interacts with Backends

## TL;DR

**The Vercel AI SDK does NOT interact with your Python backend.** Here's the actual flow:

```
Frontend (React) → Next.js API Route (AI SDK) → AI Provider (Cohere/OpenAI)
                                                        ↓
                                                   Tool Calls
                                                        ↓
Frontend (React) ← Streaming Response ← Next.js API Route
       ↓
Frontend calls Python backend separately (when needed)
```

---

## The Three-Layer Architecture

### Layer 1: Frontend (React Component)
**File**: `frontend/components/beat/AiSidebar.tsx`

```typescript
const { messages, sendMessage, addToolResult } = useChat({
  transport: new DefaultChatTransport({
    api: "/api/agent-chat",  // ← This is a Next.js API route, NOT the Python backend
  }),

  onToolCall: ({ toolCall }) => {
    // This runs in the browser, not on any server
    if (toolCall.toolName === "chopAudio") {
      // NOW we call the Python backend
      handleChopAudio(...);  // ← This will fetch to Python FastAPI
    }
  },
});
```

**Key Point**: The `useChat` hook only knows about the Next.js API route at `/api/agent-chat`. It has no knowledge of the Python backend.

---

### Layer 2: Next.js API Route (Uses AI SDK)
**File**: `frontend/app/api/agent-chat/route.ts`

```typescript
import { streamText, tool } from "ai";  // ← Vercel AI SDK
import { cohere } from "@ai-sdk/cohere";

export async function POST(req: NextRequest) {
  const { messages, blocks, model } = await req.json();

  const result = await streamText({
    model: cohere("command-a-03-2025"),  // ← AI SDK talks to Cohere's API
    messages: convertToModelMessages(messages),
    tools: { moveBlock, chopAudio, adjustSpeed, loop },
    system: "You are Lavoe Agent..."
  });

  return result.toUIMessageStreamResponse();  // ← Streams back to frontend
}
```

**Key Point**: This layer ONLY talks to:
1. The React frontend (receives requests, sends responses)
2. AI providers like Cohere/OpenAI/Google (via AI SDK)

It does NOT call the Python backend at all.

---

### Layer 3: Python Backend (FastAPI)
**File**: `backend/server.py`

```python
@app.post("/process/chop-audio")
async def chop_audio_by_id(request: ChopProcessingRequest):
    # Process audio with librosa
    y, sr = librosa.load(...)
    # ... chop audio, store results
    return ChopOutputWithIds(...)
```

**Key Point**: This is called directly by the React frontend, not by the AI SDK or Next.js API route.

---

## Detailed Flow: "Chop the drums track"

Let's trace exactly what happens:

### Step 1: User Input → Frontend
```typescript
// User types "chop the drums track"
sendMessage({ text: "chop the drums track" }, { body: { blocks: [...] } });
```

### Step 2: Frontend → Next.js API Route
```http
POST /api/agent-chat HTTP/1.1
Content-Type: application/json

{
  "messages": [{ "role": "user", "content": "chop the drums track" }],
  "blocks": [{ "id": "block-1", "name": "drums", "trackId": "track-123" }],
  "model": "command-A-03"
}
```

### Step 3: Next.js API Route → Cohere
The AI SDK sends a request to Cohere's API:

```http
POST https://api.cohere.ai/v1/chat HTTP/1.1
Authorization: Bearer <COHERE_API_KEY>
Content-Type: application/json

{
  "model": "command-a-03-2025",
  "messages": [...],
  "tools": [
    {
      "name": "chopAudio",
      "description": "Chop an audio track...",
      "input_schema": {
        "type": "object",
        "properties": {
          "trackId": { "type": "string" },
          "defaultLength": { "type": "number" },
          ...
        }
      }
    },
    ...
  ]
}
```

**Important**: The AI SDK handles this HTTP request to Cohere. Your code never sees it.

### Step 4: Cohere → Next.js API Route
Cohere's API returns a streaming response:

```json
{
  "type": "tool-call",
  "name": "chopAudio",
  "input": {
    "trackId": "track-123",
    "defaultLength": 1.8,
    "minDuration": 0.2,
    "nClusters": 3,
    "maxChops": 6
  }
}
```

The AI SDK automatically parses this and converts it to the format the frontend expects.

### Step 5: Next.js API Route → Frontend
The API route streams back to the frontend:

```typescript
// The AI SDK converts Cohere's response to this format:
{
  type: "tool-call",
  toolCallId: "call_abc123",
  toolName: "chopAudio",
  input: {
    trackId: "track-123",
    defaultLength: 1.8,
    minDuration: 0.2,
    nClusters: 3,
    maxChops: 6
  }
}
```

### Step 6: Frontend Intercepts Tool Call
```typescript
onToolCall: ({ toolCall }) => {
  if (toolCall.toolName === "chopAudio") {
    // This is where we FIRST interact with the Python backend
    handleChopAudio(
      toolCall.input.trackId,
      toolCall.input.defaultLength,
      ...
    );
  }
}
```

### Step 7: Frontend → Python Backend
**NOW** the Python backend gets involved:

```typescript
const handleChopAudio = async (trackId, defaultLength, ...) => {
  // Direct HTTP call to Python FastAPI
  const response = await authFetch(`${BACKEND_URL}/process/chop-audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      track_id: trackId,
      default_length: defaultLength,
      min_duration: minDuration,
      n_clusters: nClusters,
      max_chops: maxChops,
    }),
  });

  const result = await response.json();
  // ...
};
```

### Step 8: Python Backend Processes
```python
# Python backend receives the request
@app.post("/process/chop-audio")
async def chop_audio_by_id(request: ChopProcessingRequest):
    # Download audio, process with librosa, upload chops
    return ChopOutputWithIds(chop_track_ids=[...], ...)
```

### Step 9: Python Backend → Frontend
```json
{
  "chop_track_ids": ["chop-1", "chop-2", "chop-3"],
  "chop_summaries": [...],
  "metadata": {...}
}
```

### Step 10: Frontend → Next.js API Route (Tool Result)
```typescript
// Frontend reports back to the AI
addToolResult({
  tool: "chopAudio",
  toolCallId: "call_abc123",
  output: "Successfully chopped track track-123 into 3 segments"
});
```

### Step 11: Next.js API Route → Cohere
The AI SDK sends the tool result back to Cohere:

```http
POST https://api.cohere.ai/v1/chat HTTP/1.1

{
  "tool_results": [
    {
      "call": { "name": "chopAudio", ... },
      "outputs": [{ "output": "Successfully chopped track..." }]
    }
  ]
}
```

### Step 12: Cohere → Next.js API Route → Frontend
Cohere generates a text response based on the tool result:

```json
{
  "type": "text",
  "text": "I've chopped your drums track into 3 segments! You'll see them on the timeline now."
}
```

---

## Why This Architecture?

### Why not have the AI SDK call the Python backend directly?

**Reasons**:

1. **Security**: Python backend requires authentication. You don't want to expose auth tokens to the AI provider.

2. **Control**: Frontend can validate tool calls, add loading states, update UI optimistically, etc.

3. **Flexibility**: You can call multiple backends, cache results, retry failed calls, etc.

4. **Separation of Concerns**:
   - AI SDK = Talk to AI providers, handle streaming, parse tool calls
   - Frontend = Business logic, UI updates, backend orchestration
   - Python Backend = Heavy processing (audio, ML, database)

---

## What Does the AI SDK Actually Do?

The Vercel AI SDK is a **client library** for AI providers. It:

### 1. Abstracts Provider APIs
```typescript
// Without AI SDK (raw HTTP)
const response = await fetch("https://api.cohere.ai/v1/chat", {
  method: "POST",
  headers: { "Authorization": `Bearer ${COHERE_API_KEY}` },
  body: JSON.stringify({ model: "command-a-03-2025", messages: [...] })
});

// With AI SDK
const result = await streamText({
  model: cohere("command-a-03-2025"),
  messages: [...]
});
```

### 2. Handles Streaming
```typescript
// The AI SDK manages:
// - EventSource / SSE connections
// - Partial response buffering
// - Error recovery
// - Connection lifecycle

return result.toUIMessageStreamResponse();  // Magic!
```

### 3. Standardizes Tool Calling
Each AI provider has a different tool calling format:
- OpenAI: `function_call`
- Cohere: `tool_calls`
- Anthropic: `tool_use`
- Google: `functionCall`

The AI SDK converts all of these to a standard format:
```typescript
{
  toolCallId: "call_abc123",
  toolName: "chopAudio",
  input: { trackId: "track-123" }
}
```

### 4. Manages Conversation State
```typescript
// AI SDK keeps track of:
// - Message history
// - Tool call → tool result linkage
// - Multi-turn conversations
// - Partial responses during streaming

const { messages } = useChat();  // Automatically managed
```

---

## Common Misconceptions

### ❌ Misconception 1: "The AI SDK is a backend framework"
**Reality**: The AI SDK is a client library. It runs in your Next.js API routes (which are serverless functions), not a traditional backend server.

### ❌ Misconception 2: "Tool calls execute on the AI provider's servers"
**Reality**: Tools are metadata sent to the AI. The AI decides when to call them, but YOUR code executes them.

### ❌ Misconception 3: "I need the AI SDK to call my Python backend"
**Reality**: The AI SDK never calls your Python backend. Your frontend calls the Python backend directly when handling tool calls.

### ❌ Misconception 4: "The AI SDK stores my data"
**Reality**: The AI SDK is stateless. All state is managed by your frontend (`useChat` hook) or your database.

---

## Architecture Diagram (Corrected)

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  AiSidebar Component (React)                       │    │
│  │  - useChat() hook from @ai-sdk/react               │    │
│  │  - Handles tool execution                          │    │
│  │  - Calls Python backend when needed                │    │
│  └─────────┬──────────────────────────────┬───────────┘    │
│            │                              │                 │
└────────────┼──────────────────────────────┼─────────────────┘
             │                              │
             │ sendMessage()                │ fetch()
             │                              │
        ┌────▼─────────────┐          ┌────▼──────────────┐
        │  Next.js API     │          │  Python Backend   │
        │  /api/agent-chat │          │  FastAPI          │
        │                  │          │                   │
        │  Uses AI SDK ────┼──────┐   │  /process/chop    │
        └──────────────────┘      │   │  /process/speed   │
                                  │   └───────────────────┘
                                  │
                            ┌─────▼──────────────┐
                            │  AI Provider API   │
                            │  - Cohere          │
                            │  - OpenAI          │
                            │  - Google          │
                            └────────────────────┘
```

**Key Insight**: There are TWO separate backend connections:
1. Frontend ↔ Next.js API ↔ AI Provider (via AI SDK)
2. Frontend ↔ Python Backend (direct fetch)

These are completely independent!

---

## What About `execute` Functions?

You might see examples where tools have `execute` functions:

```typescript
const myTool = tool({
  description: "...",
  inputSchema: z.object({...}),
  execute: async (input) => {
    // This runs on the Next.js server
    const result = await callMyBackend(input);
    return result;
  }
});
```

**In your codebase, you DON'T use `execute` functions.** Why?

### With `execute` (Server-Side Execution)
```
Frontend → Next.js API → AI Provider
                ↓ (tool call)
          Next.js API executes tool
                ↓
          Calls Python backend
                ↓
          Returns result to AI Provider
                ↓
Frontend ← Response ← Next.js API
```

**Problem**: Frontend doesn't see tool execution happening. No progress updates, no UI control.

### Without `execute` (Client-Side Execution) - Your Approach
```
Frontend → Next.js API → AI Provider
    ↓           ↓ (tool call streamed back)
    ↓      Frontend receives tool call
    ↓           ↓
    ↓      Frontend executes tool
    ↓           ↓
    ↓      Calls Python backend
    ↓           ↓
    ↓      Updates UI immediately
    ↓           ↓
    └──────► Sends result back via addToolResult()
```

**Benefit**: Full control, instant UI updates, better UX.

---

## Code Example: With vs Without AI SDK

### Without AI SDK (Raw Implementation)
```typescript
// You'd have to write all this yourself:

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  // Manually build Cohere API request
  const cohereResponse = await fetch("https://api.cohere.ai/v1/chat", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      tools: [
        {
          name: "chopAudio",
          description: "Chop audio...",
          parameter_definitions: {
            trackId: { type: "string", description: "..." },
            // ... convert Zod schemas to Cohere format manually
          }
        }
      ],
      stream: true
    })
  });

  // Manually handle streaming
  const reader = cohereResponse.body.getReader();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Parse SSE format manually
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            // Convert Cohere format to UI format manually
            if (data.event_type === 'tool-calls-chunk') {
              const uiMessage = {
                type: 'tool-call',
                toolCallId: data.tool_call_id,
                toolName: data.name,
                input: JSON.parse(data.parameters)
              };
              controller.enqueue(encoder.encode(JSON.stringify(uiMessage)));
            }
            // ... handle all other event types
          }
        }
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" }
  });
}
```

### With AI SDK (What You Actually Write)
```typescript
export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const result = await streamText({
    model: cohere("command-a-03-2025"),
    messages: convertToModelMessages(messages),
    tools: {
      chopAudio: tool({
        description: "Chop audio...",
        inputSchema: z.object({
          trackId: z.string(),
          // ... Zod schemas work directly
        })
      })
    }
  });

  return result.toUIMessageStreamResponse();
}
```

**The AI SDK handles**:
- Provider API formatting
- Streaming protocol
- Tool schema conversion
- Error handling
- Response parsing

---

## Summary

**The Vercel AI SDK is a bridge between your Next.js API and AI providers (Cohere/OpenAI/Google).**

It does NOT:
- ❌ Call your Python backend
- ❌ Execute tools
- ❌ Store data
- ❌ Manage your business logic

It DOES:
- ✅ Abstract provider APIs
- ✅ Handle streaming
- ✅ Standardize tool formats
- ✅ Manage conversation state
- ✅ Parse AI responses

**Your architecture**:
```
React Frontend
    ├─→ Next.js API (uses AI SDK) ─→ Cohere/OpenAI/Google
    └─→ Python Backend (direct fetch) ─→ Audio processing
```

Two separate backends, two separate concerns!
