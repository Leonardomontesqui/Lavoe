# Beatoven Beat Generation Flow

A guide to understanding the complete flow from user prompt to generated audio in the catalog.

## Overview

Lavoe integrates with **Beatoven.ai** API to generate custom music tracks from text prompts. The system uses **polling** to monitor generation progress and stores results (main track + stems) in **Supabase**.

## Complete Flow

```
User Prompt → Backend API → Beatoven API → Polling → Download Audio → Supabase Storage → Catalog Display
```

## Step-by-Step Implementation

### 1. User Submits Prompt

**File:** `frontend/components/beat/AiSidebar.tsx`

User enters prompt (e.g., "30 seconds peaceful lo-fi chill hop track") and clicks submit.

```typescript
handleFormSubmit() → onSubmit("beat", "beatoven")
```

### 2. Frontend Initiates Generation

**File:** `frontend/components/beat-maker.tsx` (Lines 366-414)

```typescript
const generateBeatovenTrack = async () => {
  setIsGeneratingTrack(true);

  const response = await authFetch(`${BACKEND_URL}/start_track_generation`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: { text: userPrompt },
      format: "mp3",
      looping: false
    })
  });

  const result = await response.json();
  // result = { status: "started", task_id: "..." }

  pollForTrackCompletion(result.task_id);
};
```

### 3. Backend Calls Beatoven API

**File:** `backend/server.py` (Lines 1250-1298)

```python
@app.post("/start_track_generation")
async def start_track_generation(request: TrackGenerationRequest):
    # Call Beatoven's compose API
    response = requests.post(
        "https://public-api.beatoven.ai/api/v1/tracks/compose",
        headers={
            "Authorization": f"Bearer {BEATOVEN_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "prompt": request.prompt,
            "format": request.format,
            "looping": request.looping
        }
    )

    data = response.json()
    return {"status": "started", "task_id": data["task_id"]}
```

### 4. Frontend Starts Polling

**File:** `frontend/components/beat-maker.tsx` (Lines 416-508)

**Polling Configuration:**
- **Interval:** 10 seconds
- **Max duration:** 10 minutes (60 attempts)
- **Method:** Recursive `setTimeout` (not `setInterval`)

```typescript
const pollForTrackCompletion = async (taskId: string) => {
  let attempts = 0;
  const maxAttempts = 60;
  const pollInterval = 10000; // 10 seconds

  const poll = async () => {
    attempts++;
    setGenerationStatus(`Track generation in progress... (${attempts}/${maxAttempts})`);

    const response = await authFetch(
      `${BACKEND_URL}/get_generated_track?task_id=${taskId}`
    );
    const result = await response.json();

    if (result.status === "composed") {
      // Success! Stop polling
      setIsGeneratingTrack(false);
      setTracksRefreshTrigger(prev => prev + 1); // Refresh catalog
      setActiveTab("tracks"); // Switch to Tracks tab
    } else if (result.status === "running" || result.status === "composing") {
      // Still processing - continue polling
      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval);
      } else {
        // Timeout after 10 minutes
        setGenerationStatus("Track generation timed out");
      }
    } else {
      // Error state
      setGenerationStatus(`Error: ${result.status}`);
    }
  };

  poll(); // Start polling
};
```

### 5. Backend Polls Beatoven & Downloads Audio

**File:** `backend/server.py` (Lines 1307-1430)

**While Processing:**
```python
@app.get("/get_generated_track")
async def get_generated_track(task_id: str):
    # Check Beatoven API status
    response = requests.get(
        f"https://public-api.beatoven.ai/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {BEATOVEN_API_KEY}"}
    )
    data = response.json()

    # While still processing, return status to frontend
    if data["status"] in ["composing", "running"]:
        return {"status": data["status"]}
```

**When Complete:**
```python
    # When status = "composed", download and store audio
    if data["status"] == "composed":
        meta = data["meta"]

        # 1. Download main track
        main_response = requests.get(meta["track_url"])
        main_track_id = sb_storage.store_audio(
            user_id=user_id,
            audio_bytes=main_response.content,
            filename=f"beatoven_track_{task_id}.mp3",
            metadata={
                'processing_type': 'beatoven_main_track',
                'beatoven_task_id': task_id,
                'prompt': meta.get('prompt', {}),
                'version': meta.get('version')
            }
        )

        # 2. Download all stems (bass, chords, melody, percussion)
        stems = {}
        for stem_type, stem_url in meta.get("stems_url", {}).items():
            stem_response = requests.get(stem_url)
            stem_id = sb_storage.store_audio(
                user_id=user_id,
                audio_bytes=stem_response.content,
                filename=f"beatoven_{stem_type}_{task_id}.mp3",
                metadata={
                    'processing_type': f'beatoven_stem_{stem_type}',
                    'stem_type': stem_type,
                    'main_track_id': main_track_id
                }
            )
            stems[stem_type] = stem_id

        # Return track IDs to frontend
        return {
            "status": "composed",
            "track_id": main_track_id,
            "stems": stems,
            "metadata": {...}
        }
```

### 6. Writing to Supabase

**File:** `backend/supabase_storage.py` (Lines 36-88)

**Two-Step Process:**

**A. Upload to Storage Bucket:**
```python
def store_audio(self, user_id: str, audio_bytes: bytes, filename: str, metadata: dict):
    track_id = str(uuid.uuid4())
    object_key = f"users/{user_id}/tracks/{track_id}.mp3"

    # Upload bytes to Supabase Storage
    self.client.storage.from_(self.bucket_name).upload(
        path=object_key,
        file=audio_bytes,
        file_options={"content-type": "audio/mpeg"}
    )
```

**B. Insert Metadata Row:**
```python
    # Insert row in tracks table
    self.client.table("tracks").insert({
        "track_id": track_id,
        "user_id": user_id,
        "object_key": object_key,
        "filename": filename,
        "extension": ".mp3",
        "content_type": "audio/mpeg",
        "size_bytes": len(audio_bytes),
        "processing_type": metadata.get("processing_type"),
        "metadata": metadata
    }).execute()

    return track_id
```

**What Gets Stored:**
- 1 main track
- 4 stems (bass, chords, melody, percussion)
- **Total: 5 files** per generation

### 7. Catalog Refresh

**File:** `frontend/components/beat/AiSidebar.tsx` (Lines 322-336)

When polling completes, `tracksRefreshTrigger` increments, triggering:

```typescript
useEffect(() => {
  if (tracksRefreshTrigger > 0) {
    fetchTracks();
  }
}, [tracksRefreshTrigger]);

const fetchTracks = async () => {
  const response = await authFetch(`${BACKEND_URL}/tracks`);
  const data = await response.json();
  setTracks(data); // Update catalog
};
```

**Backend:** `GET /tracks` queries Supabase and returns all user tracks.

### 8. Display in Catalog

**File:** `frontend/components/beat/Catalog.tsx` (Lines 307-446)

Each track is rendered as a card with:
- Waveform visualization
- Type badge (color-coded by processing_type)
- File size and duration
- Play/Pause, Download, and Add to Timeline buttons

**Type Color Coding:**
- `beatoven_main_track` → Blue
- `beatoven_stem_bass` → Cyan
- `beatoven_stem_chords` → Green
- `beatoven_stem_melody` → Purple
- `beatoven_stem_percussion` → Orange

## Key Design Decisions

### Why Polling?

Beatoven API is **asynchronous** - generation takes 30 seconds to several minutes. Polling allows:
- Non-blocking UI (user can continue working)
- Progress feedback to user
- Reliable status checking without webhooks

### Why Store Everything in Supabase?

- **Persistence:** Tracks available across sessions
- **Stems Available:** Individual instrument stems for remixing
- **User Isolation:** Each user has their own track library
- **Signed URLs:** Secure, temporary access to audio files

### Polling vs. Webhooks

**Current: Polling**
- Simpler implementation
- No need for public webhook endpoint
- Works in all deployment environments

**Alternative: Webhooks** (not implemented)
- Would require public endpoint
- Faster notification (no 10s delay)
- More complex setup

## Flow Diagram

```
┌──────────────────┐
│  User Input      │
│  "lo-fi track"   │
└────────┬─────────┘
         ↓
┌──────────────────────────────────┐
│  Frontend: AiSidebar.tsx         │
│  handleFormSubmit()              │
└────────┬─────────────────────────┘
         ↓
┌──────────────────────────────────┐
│  Frontend: beat-maker.tsx        │
│  generateBeatovenTrack()         │
│  POST /start_track_generation    │
└────────┬─────────────────────────┘
         ↓
┌──────────────────────────────────┐
│  Backend: server.py              │
│  POST to Beatoven API            │
│  /api/v1/tracks/compose          │
└────────┬─────────────────────────┘
         ↓
┌──────────────────────────────────┐
│  Beatoven API                    │
│  Returns: task_id                │
└────────┬─────────────────────────┘
         ↓
┌──────────────────────────────────┐
│  Frontend: Start Polling         │
│  Every 10s for up to 10 min      │
│  GET /get_generated_track        │
└────────┬─────────────────────────┘
         ↓
┌──────────────────────────────────┐
│  Backend: Poll Beatoven          │
│  GET /api/v1/tasks/{task_id}     │
│                                  │
│  While "running":                │
│    → Return status to frontend   │
│                                  │
│  When "composed":                │
│    → Download main + 4 stems     │
│    → Store 5 files in Supabase   │
│    → Return track_ids            │
└────────┬─────────────────────────┘
         ↓
┌──────────────────────────────────┐
│  Supabase Storage                │
│  - Upload 5 audio files          │
│  - Insert 5 metadata rows        │
│  Path: users/{id}/tracks/{uuid}  │
└────────┬─────────────────────────┘
         ↓
┌──────────────────────────────────┐
│  Frontend: Refresh Catalog       │
│  GET /tracks                     │
│  Update track list state         │
└────────┬─────────────────────────┘
         ↓
┌──────────────────────────────────┐
│  Catalog Display                 │
│  - Main track (blue)             │
│  - Bass stem (cyan)              │
│  - Chords stem (green)           │
│  - Melody stem (purple)          │
│  - Percussion stem (orange)      │
└──────────────────────────────────┘
```

## How to Modify

### Change Polling Interval
**File:** `frontend/components/beat-maker.tsx:421`
```typescript
const pollInterval = 10000; // Change to 5000 for 5s intervals
```

### Change Max Wait Time
**File:** `frontend/components/beat-maker.tsx:420`
```typescript
const maxAttempts = 60; // Change to 120 for 20 minutes (at 10s intervals)
```

### Add Webhook Support
1. Create webhook endpoint in `backend/server.py`
2. Register webhook URL with Beatoven API (if supported)
3. Remove polling logic from frontend
4. Use WebSocket or server-sent events to notify frontend

### Store Different Audio Formats
**File:** `frontend/components/beat-maker.tsx:376`
```typescript
format: "mp3" // Change to "wav" for uncompressed
```

### Skip Stem Downloads
**File:** `backend/server.py:1382-1403`
```python
# Comment out the stem download loop
# for stem_type, stem_url in meta.get("stems_url", {}).items():
#     ...
```

## Environment Variables

**Required:** `backend/.env`
```
BEATOVEN_API_KEY=your_beatoven_api_key
```

Get API key from: https://beatoven.ai

## Error Handling

**Timeout:** 10 minutes (60 polls × 10s)
**Network Errors:** Retries within poll attempt limit
**Beatoven API Errors:** Returned to frontend with error status
**Storage Failures:** Logged in backend, error returned to frontend

---

**Tech Stack:** Next.js + FastAPI + Beatoven API + Supabase Storage
