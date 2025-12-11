# Simplified Agent Flow (The Actual Flow)

## The Complete Flow for "Chop the drums track"

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: You Submit a Prompt                                     │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
        User types: "Chop the drums track"
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Frontend Sends to Next.js API Route                     │
└─────────────────────────────────────────────────────────────────┘
                           │
    POST /api/agent-chat with:
    - Message: "Chop the drums track"
    - Blocks: [{ id: "block-1", name: "drums", trackId: "track-123" }]
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Next.js API Asks Cohere AI                              │
└─────────────────────────────────────────────────────────────────┘
                           │
    Cohere receives:
    - Your message
    - Current timeline state
    - Available tools: moveBlock, chopAudio, adjustSpeed, loop
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Cohere AI Thinks and Decides                            │
└─────────────────────────────────────────────────────────────────┘
                           │
    Cohere thinks:
    "The user wants to chop drums. I see a block called 'drums'
     with trackId 'track-123'. I should use the chopAudio tool
     with that track ID."
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Cohere Returns Tool Call (NOT executing, just saying)   │
└─────────────────────────────────────────────────────────────────┘
                           │
    Cohere says: "Please call chopAudio with these parameters:"
    {
      toolName: "chopAudio",
      input: {
        trackId: "track-123",
        defaultLength: 1.8,
        minDuration: 0.2,
        nClusters: 3,
        maxChops: 6
      }
    }
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Frontend Receives Tool Call                             │
└─────────────────────────────────────────────────────────────────┘
                           │
    onToolCall({ toolCall }) {
      // "Ah, Cohere wants me to chop audio. Let me do that."
    }
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 7: Frontend Calls Python Backend                           │
│ (THIS IS WHERE THE BACKEND GETS INVOLVED)                       │
└─────────────────────────────────────────────────────────────────┘
                           │
    fetch("http://localhost:8000/process/chop-audio", {
      method: "POST",
      body: JSON.stringify({
        track_id: "track-123",
        default_length: 1.8,
        min_duration: 0.2,
        n_clusters: 3,
        max_chops: 6
      })
    })
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 8: Python Backend Chops the Audio                          │
└─────────────────────────────────────────────────────────────────┘
                           │
    - Downloads audio from Supabase
    - Uses librosa to detect onsets
    - Creates 6 chops
    - Uploads each chop as new track
    - Returns chop IDs
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 9: Frontend Receives Chops                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
    Response: {
      chop_track_ids: ["chop-1", "chop-2", "chop-3", ...],
      chop_summaries: [...]
    }
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 10: Frontend Updates UI                                    │
└─────────────────────────────────────────────────────────────────┘
                           │
    onAddChopsToEditor(chop_summaries)
    // New blocks appear on timeline!
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 11: Frontend Tells AI "Success!"                           │
└─────────────────────────────────────────────────────────────────┘
                           │
    addToolResult({
      tool: "chopAudio",
      output: "Successfully chopped track into 6 segments"
    })
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 12: AI Generates Final Response                            │
└─────────────────────────────────────────────────────────────────┘
                           │
    Cohere receives the success message and says:
    "I've chopped your drums into 6 segments! They're on the timeline now."
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 13: You See the Result                                     │
└─────────────────────────────────────────────────────────────────┘
    - AI message appears in chat
    - Chop blocks visible on timeline
    - Total time: ~2-5 seconds
```

---

## Key Insight: The AI Doesn't Execute Anything

The AI is like a **consultant** who gives recommendations:

```typescript
// What the AI does:
"Based on your request, I recommend calling chopAudio
 with trackId='track-123' and these parameters..."

// What the AI does NOT do:
"Let me chop that audio for you..." ❌
```

Then your **frontend** (React component) actually executes the recommendation:

```typescript
// What the frontend does:
onToolCall: ({ toolCall }) => {
  if (toolCall.toolName === "chopAudio") {
    // "OK AI, I'll do that for you"
    fetch(BACKEND_URL + "/process/chop-audio", {
      method: "POST",
      body: JSON.stringify(toolCall.input)
    });
  }
}
```

---

## Who Does What?

| Actor | Responsibility |
|-------|---------------|
| **You** | Type the command |
| **Frontend (React)** | Send message, receive tool calls, execute tools, update UI |
| **Next.js API** | Relay messages between frontend and AI provider |
| **AI (Cohere)** | Understand intent, decide which tool to use, generate response text |
| **Python Backend** | Process audio, store files, return results |

---

## Why This Matters

### The AI Can't Access Your Backend
The AI (Cohere) runs on Cohere's servers. It has no access to:
- Your database
- Your files
- Your Python backend
- Your user's data

**This is a security feature!**

The AI only knows:
1. What you tell it (your messages + blocks state)
2. What tools are available (names and parameters)
3. What results you report back (via `addToolResult`)

### The Frontend is the Controller
Your React component is the "orchestrator":
- It decides whether to trust the AI's tool recommendation
- It can add validation, error handling, retries
- It can update the UI optimistically before the backend responds
- It controls exactly what the AI knows

---

## Real Code Example

**File**: `frontend/components/beat/AiSidebar.tsx:360-413`

```typescript
onToolCall: ({ toolCall }) => {
  console.log("🔧 AI wants to call:", toolCall.toolName);
  console.log("📋 With parameters:", toolCall.input);

  // The AI is NOT executing this - it's just recommending it
  // WE (the frontend) decide whether to execute

  if (toolCall.toolName === "chopAudio") {
    // Validate if we want to
    if (!toolCall.input.trackId) {
      console.error("❌ No trackId provided, ignoring");
      return;
    }

    // Add loading state
    setIsProcessing(true);

    // NOW we call the backend (AI never touches this)
    handleChopAudio(
      toolCall.input.trackId,
      toolCall.input.defaultLength || 1.8,
      toolCall.input.minDuration || 0.2,
      toolCall.input.nClusters || 3,
      toolCall.input.maxChops || 6,
      toolCall.toolCallId
    );
  }
}
```

**File**: `frontend/components/beat/AiSidebar.tsx:520-591`

```typescript
const handleChopAudio = async (...params) => {
  try {
    // THIS is where we call your Python backend
    const response = await authFetch(
      `${BACKEND_URL}/process/chop-audio`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track_id: trackId,
          default_length: defaultLength,
          // ...
        })
      }
    );

    const result = await response.json();

    // Update UI
    onAddChopsToEditor(result.chop_summaries, ...);

    // Tell the AI what happened
    addToolResult({
      tool: "chopAudio",
      toolCallId: toolCallId,
      output: `Successfully chopped into ${result.chop_summaries.length} segments`
    });

  } catch (error) {
    // Tell the AI it failed
    addToolResult({
      tool: "chopAudio",
      toolCallId: toolCallId,
      output: `Failed: ${error.message}`
    });
  }
};
```

---

## Summary

Your original understanding was close! The correction:

### What You Said:
> "The agent makes a POST request to the backend"

### Correction:
> "The agent **tells the frontend what to do**, then the frontend makes a POST request to the backend"

**The flow is**:
1. ✅ You submit a prompt
2. ✅ Agent evaluates and chooses tool
3. ❌ ~~Agent makes POST request~~ → ✅ **Agent tells frontend to use tool**
4. ✅ **Frontend makes POST request to backend**
5. ✅ Backend chops the audio
6. ✅ Frontend receives results
7. ✅ Frontend updates UI
8. ✅ Frontend tells agent "done!"
9. ✅ Agent generates response text

**The agent is a recommender, the frontend is the executor.**
