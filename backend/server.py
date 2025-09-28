import os
import tempfile
import base64
import io
import logging
import asyncio
from contextlib import asynccontextmanager

import httpx
import librosa
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any

from audio_processing import get_harmonic_components, get_percussive_components, add_reverb, adjust_pitch, adjust_speed
from audio_storage import get_audio_storage
from supabase_storage import SupabaseStorage
from auth_helpers import get_user_id_from_token
import json
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configuration
BEATOVEN_API_KEY = os.getenv("BEATOVEN_API_KEY")
MUBERT_CUSTOMER_ID = os.getenv("MUBERT_CUSTOMER_ID")
MUBERT_ACCESS_TOKEN = os.getenv("MUBERT_ACCESS_TOKEN")

def get_beatoven_headers():
    """Get authorization headers for Beatoven AI API."""
    if not BEATOVEN_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="BEATOVEN_API_KEY environment variable is not set"
        )
    return {"Authorization": f"Bearer {BEATOVEN_API_KEY}"}

def get_mubert_headers():
    """Get authorization headers for Mubert API."""
    if not MUBERT_CUSTOMER_ID or not MUBERT_ACCESS_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="MUBERT_CUSTOMER_ID and MUBERT_ACCESS_TOKEN environment variables are not set"
        )
    return {
        "customer-id": MUBERT_CUSTOMER_ID,
        "access-token": MUBERT_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }

# Pydantic models for Beatoven AI API
class PromptModel(BaseModel):
    text: str

class TrackGenerationRequest(BaseModel):
    prompt: PromptModel
    format: Optional[str] = "wav"
    looping: Optional[bool] = False

class TrackGenerationResponse(BaseModel):
    status: str
    task_id: str

class TrackStatusRequest(BaseModel):
    task_id: str

# Pydantic models for Mubert API
class MubertGenerationRequest(BaseModel):
    prompt: str
    duration: Optional[int] = 60
    bitrate: Optional[int] = 128
    mode: Optional[str] = "track"
    intensity: Optional[str] = "medium"
    format: Optional[str] = "mp3"

# Background task for cleanup
cleanup_task = None

async def periodic_cleanup():
    """Background task to periodically clean up old audio files."""
    while True:
        try:
            await asyncio.sleep(3600)  # Run every hour
            storage = get_audio_storage()
            deleted_count = storage.cleanup_old_tracks()
            if deleted_count > 0:
                logger.info(f"Background cleanup: removed {deleted_count} old tracks")
        except Exception as e:
            logger.error(f"Background cleanup error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - start/stop background tasks."""
    global cleanup_task
    
    # Startup
    logger.info("Starting Lavoe Audio Processing API")
    cleanup_task = asyncio.create_task(periodic_cleanup())
    logger.info("Background cleanup task started")
    
    yield
    
    # Shutdown
    if cleanup_task:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
    logger.info("Lavoe Audio Processing API shutdown complete")

app = FastAPI(
    title="Lavoe Audio Processing API", 
    version="1.0.0",
    lifespan=lifespan
)

# Supabase storage adapter (used for per-user storage)
sb_storage = None
try:
    sb_storage = SupabaseStorage()
    logger.info("SupabaseStorage initialized")
except Exception as e:
    logger.warning(f"SupabaseStorage not configured or failed to init: {e}")

# Pydantic models for Base64 audio processing
class AudioInput(BaseModel):
    audio_data: str = Field(..., description="Base64 encoded audio data")
    filename: Optional[str] = Field(default="audio.wav", description="Original filename for reference")
    
    @validator('audio_data')
    def validate_audio_data(cls, v):
        if not v or not isinstance(v, str):
            raise ValueError('audio_data must be a non-empty string')
        try:
            base64.b64decode(v)
        except Exception:
            raise ValueError('audio_data must be valid base64 encoded data')
        return v

class ReverbInput(BaseModel):
    audio_data: str = Field(..., description="Base64 encoded audio data")
    filename: Optional[str] = Field(default="audio.wav", description="Original filename for reference")
    room_size: float = Field(default=0.5, ge=0.0, le=1.0, description="Size of the reverb room (0.0 to 1.0)")
    damping: float = Field(default=0.5, ge=0.0, le=1.0, description="High frequency damping (0.0 to 1.0)")
    wet_level: float = Field(default=0.3, ge=0.0, le=1.0, description="Reverb effect level (0.0 to 1.0)")
    dry_level: float = Field(default=0.7, ge=0.0, le=1.0, description="Original signal level (0.0 to 1.0)")
    
    @validator('audio_data')
    def validate_audio_data(cls, v):
        if not v or not isinstance(v, str):
            raise ValueError('audio_data must be a non-empty string')
        try:
            base64.b64decode(v)
        except Exception:
            raise ValueError('audio_data must be valid base64 encoded data')
        return v

class ChopInput(BaseModel):
    audio_data: str = Field(..., description="Base64 encoded audio data")
    filename: Optional[str] = Field(default="audio.wav", description="Original filename for reference")
    default_length: float = Field(default=1.8, ge=0.1, le=10.0, description="Default length for chops in seconds")
    min_duration: float = Field(default=0.2, ge=0.05, le=2.0, description="Minimum duration for chops in seconds")
    n_clusters: int = Field(default=3, ge=1, le=20, description="Number of clusters for grouping similar chops")
    max_chops: int = Field(default=6, ge=1, le=50, description="Maximum number of chops to return, picks best representatives from each cluster")
    
    @validator('audio_data')
    def validate_audio_data(cls, v):
        if not v or not isinstance(v, str):
            raise ValueError('audio_data must be a non-empty string')
        try:
            base64.b64decode(v)
        except Exception:
            raise ValueError('audio_data must be valid base64 encoded data')
        return v

class AudioOutput(BaseModel):
    audio_data: str  # Base64 encoded processed audio
    filename: str
    metadata: Dict[str, Any]

class ChopOutput(BaseModel):
    chops: List[Dict[str, Any]]
    metadata: Dict[str, Any]

# New models for ID-based audio system
class TrackReference(BaseModel):
    track_id: str = Field(..., description="Unique identifier for the audio track")
    filename: Optional[str] = Field(None, description="Original filename")
    file_size: Optional[int] = Field(None, description="File size in bytes")
    duration_seconds: Optional[float] = Field(None, description="Duration in seconds")
    sample_rate: Optional[int] = Field(None, description="Sample rate in Hz")
    channels: Optional[int] = Field(None, description="Number of audio channels")
    processing_type: Optional[str] = Field(None, description="Type of processing applied")
    created_at: Optional[str] = Field(None, description="Creation timestamp")

class TrackUploadResponse(BaseModel):
    track_id: str = Field(..., description="Unique identifier for the stored track")
    message: str = Field(..., description="Success message")
    metadata: TrackReference = Field(..., description="Track metadata")

class TrackProcessingRequest(BaseModel):
    track_id: str = Field(..., description="ID of the track to process")

class ReverbProcessingRequest(BaseModel):
    track_id: str = Field(..., description="ID of the track to process")
    room_size: float = Field(default=0.5, ge=0.0, le=1.0, description="Size of the reverb room (0.0 to 1.0)")
    damping: float = Field(default=0.5, ge=0.0, le=1.0, description="High frequency damping (0.0 to 1.0)")
    wet_level: float = Field(default=0.3, ge=0.0, le=1.0, description="Reverb effect level (0.0 to 1.0)")
    dry_level: float = Field(default=0.7, ge=0.0, le=1.0, description="Original signal level (0.0 to 1.0)")

class ChopProcessingRequest(BaseModel):
    track_id: str = Field(..., description="ID of the track to process")
    default_length: float = Field(default=1.8, ge=0.1, le=10.0, description="Default length for chops in seconds")
    min_duration: float = Field(default=0.2, ge=0.05, le=2.0, description="Minimum duration for chops in seconds")
    n_clusters: int = Field(default=3, ge=1, le=20, description="Number of clusters for grouping similar chops")
    max_chops: int = Field(default=6, ge=1, le=50, description="Maximum number of chops to return, picks best representatives from each cluster")

class SpeedProcessingRequest(BaseModel):
    track_id: str = Field(..., description="ID of the track to process")
    speed_factor: float = Field(..., ge=0.1, le=10.0, description="Speed multiplication factor (1.0 = normal, 2.0 = 2x faster, 0.5 = 2x slower)")

class ChopOutputWithIds(BaseModel):
    chop_track_ids: List[str] = Field(..., description="List of track IDs for the generated chops")
    chop_summaries: List[TrackReference] = Field(..., description="Lightweight summaries of chop tracks")
    metadata: Dict[str, Any] = Field(..., description="Processing metadata")

class StorageStats(BaseModel):
    total_tracks: int
    total_size_bytes: int
    total_size_mb: float
    storage_dir: str
    max_age_hours: int

# Helper functions
def decode_base64_audio(audio_data: str) -> bytes:
    """Decode base64 audio data to bytes."""
    try:
        if not audio_data:
            raise ValueError("Empty audio data")
        return base64.b64decode(audio_data)
    except Exception as e:
        logger.error(f"Base64 decode error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio data: {str(e)}")

def encode_audio_to_base64(audio_bytes: bytes) -> str:
    """Encode audio bytes to base64 string."""
    return base64.b64encode(audio_bytes).decode('utf-8')

def process_audio_from_base64(audio_data: str, filename: str = "audio.wav"):
    """Process base64 audio data and return numpy array and sample rate."""
    temp_file_path = None
    try:
        audio_bytes = decode_base64_audio(audio_data)
        
        # Create temporary file
        file_ext = '.wav'  # Default to wav
        if filename and '.' in filename:
            file_ext = '.' + filename.split('.')[-1].lower()
        
        with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_file:
            temp_file.write(audio_bytes)
            temp_file_path = temp_file.name
        
        # Load with librosa
        y, sr = librosa.load(temp_file_path, sr=None)
        
        if len(y) == 0:
            raise ValueError("Audio file is empty or corrupted")
            
        logger.info(f"Loaded audio: {len(y)} samples at {sr}Hz")
        return y, sr, temp_file_path
        
    except Exception as e:
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        logger.error(f"Audio processing error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error loading audio: {str(e)}")

def save_audio_to_base64(y: np.ndarray, sr: int) -> str:
    """Save numpy audio array to base64 encoded WAV."""
    temp_file_path = None
    try:
        if len(y) == 0:
            raise ValueError("Cannot save empty audio array")
            
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            sf.write(temp_file.name, y, sr)
            temp_file_path = temp_file.name
        
        with open(temp_file_path, 'rb') as f:
            audio_bytes = f.read()
        
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
            
        return encode_audio_to_base64(audio_bytes)
        
    except Exception as e:
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        logger.error(f"Audio encoding error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error encoding audio: {str(e)}")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base64 Audio Processing Endpoints for AI Agent Integration

@app.post("/extract-harmonics", response_model=AudioOutput)
async def extract_harmonics_base64(input_data: AudioInput, request: Request):
    """
    Extract harmonic components from Base64 encoded audio.
    
    Args:
        input_data: AudioInput containing Base64 encoded audio data
        
    Returns:
        AudioOutput with Base64 encoded harmonic audio and metadata
    """
    temp_file_path = None
    try:
        logger.info(f"Processing harmonic extraction request from {request.client.host if request.client else 'unknown'}")
        
        # Process audio from Base64
        y, sr, temp_file_path = process_audio_from_base64(input_data.audio_data, input_data.filename)
        
        # Extract harmonic components
        y_harmonic = get_harmonic_components(y)
        
        if len(y_harmonic) == 0:
            raise ValueError("Harmonic extraction resulted in empty audio")
        
        # Convert back to Base64
        harmonic_base64 = save_audio_to_base64(y_harmonic, sr)
        
        # Generate output filename
        base_name = input_data.filename.split('.')[0] if input_data.filename else "audio"
        output_filename = f"harmonic_{base_name}.wav"
        
        # Create metadata
        metadata = {
            "original_filename": input_data.filename,
            "processing_type": "harmonic_extraction",
            "sample_rate": int(sr),
            "duration_seconds": float(len(y_harmonic) / sr),
            "channels": 1 if len(y_harmonic.shape) == 1 else y_harmonic.shape[0],
            "original_duration": float(len(y) / sr)
        }
        
        logger.info(f"Successfully processed harmonic extraction: {len(y_harmonic)} samples")
        
        return AudioOutput(
            audio_data=harmonic_base64,
            filename=output_filename,
            metadata=metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Harmonic extraction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Harmonic extraction error: {str(e)}")
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)


@app.post("/process-reverb", response_model=AudioOutput)
async def process_reverb_base64(input_data: ReverbInput, request: Request):
    """
    Apply reverb effect to Base64 encoded audio.
    
    Args:
        input_data: ReverbInput containing Base64 audio and reverb parameters
        
    Returns:
        AudioOutput with Base64 encoded processed audio and metadata
    """
    temp_file_path = None
    try:
        logger.info(f"Processing reverb request from {request.client.host if request.client else 'unknown'}")
        
        # Process audio from Base64
        y, sr, temp_file_path = process_audio_from_base64(input_data.audio_data, input_data.filename)
        
        # Apply reverb effect
        y_reverb = add_reverb(
            y, 
            sample_rate=sr, 
            room_size=input_data.room_size,
            damping=input_data.damping, 
            wet_level=input_data.wet_level, 
            dry_level=input_data.dry_level
        )
        
        if len(y_reverb) == 0:
            raise ValueError("Reverb processing resulted in empty audio")
        
        # Convert back to Base64
        reverb_base64 = save_audio_to_base64(y_reverb, sr)
        
        # Generate output filename
        base_name = input_data.filename.split('.')[0] if input_data.filename else "audio"
        output_filename = f"reverb_{base_name}.wav"
        
        # Create metadata
        metadata = {
            "original_filename": input_data.filename,
            "processing_type": "reverb",
            "sample_rate": int(sr),
            "duration_seconds": float(len(y_reverb) / sr),
            "channels": 1 if len(y_reverb.shape) == 1 else y_reverb.shape[0],
            "original_duration": float(len(y) / sr),
            "reverb_settings": {
                "room_size": input_data.room_size,
                "damping": input_data.damping,
                "wet_level": input_data.wet_level,
                "dry_level": input_data.dry_level
            }
        }
        
        logger.info(f"Successfully processed reverb: {len(y_reverb)} samples")
        
        return AudioOutput(
            audio_data=reverb_base64,
            filename=output_filename,
            metadata=metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reverb processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Reverb processing error: {str(e)}")
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)


@app.post("/chop-audio", response_model=ChopOutput)
async def chop_audio_base64(input_data: ChopInput, request: Request):
    """
    Chop audio into segments using harmonic component analysis.
    
    Args:
        input_data: ChopInput containing Base64 audio and chopping parameters
        
    Returns:
        ChopOutput with array of chop segments and metadata
    """
    temp_file_path = None
    try:
        logger.info(f"Processing chop audio request from {request.client.host if request.client else 'unknown'}")
        
        # Process audio from Base64
        y, sr, temp_file_path = process_audio_from_base64(input_data.audio_data, input_data.filename)
        
        # Apply HPSS to get harmonic component
        y_harmonic, _ = librosa.effects.hpss(y)
        
        # Detect onsets on harmonic component
        onset_kwargs = dict(backtrack=True, pre_max=7, post_max=7, pre_avg=7, post_avg=7, delta=0.25, wait=0)
        oenv = librosa.onset.onset_strength(y=y_harmonic, sr=sr, hop_length=512)
        onset_frames = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=512, **onset_kwargs)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=512)
        
        # Create chops from onsets
        chops_sec = []
        n = len(onset_times)
        for i, t in enumerate(onset_times):
            start = float(t)
            if i < n - 1:
                end = float(onset_times[i + 1])
                if end - start < input_data.min_duration:
                    end = start + input_data.default_length
            else:
                end = start + input_data.default_length
            if end <= start:
                end = start + input_data.min_duration
            chops_sec.append((start, end))
        
        if len(chops_sec) == 0:
            chops_sec = [(0.0, len(y_harmonic) / sr)]
        
        # Extract features and create chop data
        chops = []
        feature_matrix = []
        
        for i, (start, end) in enumerate(chops_sec):
            duration = end - start
            chop_id = f'harmonic_chop_{i:03d}'
            
            # Extract audio slice
            start_sample = int(round(start * sr))
            end_sample = int(round(end * sr))
            y_slice = y_harmonic[start_sample:end_sample]
            
            # Extract features
            if y_slice.size == 0:
                features = {
                    'rms': 0.0, 'centroid': 0.0, 'zcr': 0.0,
                    'chroma_mean': [0.0] * 12, 'mfcc_mean': [0.0] * 13,
                    'dominant_pc': None, 'dominant_note': None
                }
            else:
                features = {}
                features['rms'] = float(np.mean(librosa.feature.rms(y=y_slice)[0]))
                features['centroid'] = float(np.mean(librosa.feature.spectral_centroid(y=y_slice, sr=sr)[0]))
                features['zcr'] = float(np.mean(librosa.feature.zero_crossing_rate(y_slice)[0]))
                
                chroma = librosa.feature.chroma_stft(y=y_slice, sr=sr)
                features['chroma_mean'] = [float(x) for x in np.mean(chroma, axis=1)]
                dom = int(np.argmax(features['chroma_mean'])) if np.array(features['chroma_mean']).size > 0 else None
                features['dominant_pc'] = dom
                features['dominant_note'] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][dom] if dom is not None else None
                
                mfcc = librosa.feature.mfcc(y=y_slice, sr=sr, n_mfcc=13)
                features['mfcc_mean'] = [float(x) for x in np.mean(mfcc, axis=1)]
            
            # Convert slice to Base64
            slice_base64 = save_audio_to_base64(y_slice, sr)
            
            # Create feature vector for clustering
            feature_vec = [features['rms'], features['centroid'], features['zcr']] + features['mfcc_mean'][:4]
            feature_matrix.append(feature_vec)
            
            chop_data = {
                'id': chop_id,
                'audio_data': slice_base64,
                'start': float(start),
                'end': float(end),
                'duration': float(duration),
                'features': features,
                'descriptor': f"Harmonic | RMS={features['rms']:.4f} | Dur={duration:.2f}"
            }
            chops.append(chop_data)
        
        # Perform clustering if possible
        if len(feature_matrix) > 0:
            X = np.array(feature_matrix)
            try:
                k = min(input_data.n_clusters, X.shape[0])
                if k > 1:
                    scaler = StandardScaler()
                    X_scaled = scaler.fit_transform(X)
                    kmeans = KMeans(n_clusters=k, random_state=0, n_init=10).fit(X_scaled)
                    labels = kmeans.labels_
                    
                    for chop, label in zip(chops, labels):
                        chop['cluster_label'] = int(label)
                        chop['descriptor'] += f" | Cluster={label}"
                else:
                    for chop in chops:
                        chop['cluster_label'] = 0
                        
            except Exception as e:
                logger.warning(f"Clustering failed: {str(e)}")
                for chop in chops:
                    chop['cluster_label'] = 0
        
        # Create metadata
        metadata = {
            "original_filename": input_data.filename,
            "processing_type": "audio_chopping",
            "sample_rate": int(sr),
            "total_chops": len(chops),
            "chopping_params": {
                "default_length": input_data.default_length,
                "min_duration": input_data.min_duration,
                "n_clusters": input_data.n_clusters
            },
            "onset_detection": {
                "onsets_detected": len(onset_times),
                "onset_times": [float(t) for t in onset_times]
            }
        }
        
        logger.info(f"Successfully processed audio chopping: {len(chops)} chops created")
        
        return ChopOutput(chops=chops, metadata=metadata)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audio chopping error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Audio chopping error: {str(e)}")
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)


# Agent-Friendly Processing Endpoints (using Track IDs)

@app.post("/process/extract-harmonics", response_model=TrackUploadResponse)
async def extract_harmonics_by_id(request: TrackProcessingRequest, authorization: str | None = Header(default=None)):
    """
    Extract harmonic components from a stored track using track ID.
    Returns a new track ID for the processed audio - perfect for AI agents.
    
    Args:
        request: TrackProcessingRequest with track_id
        
    Returns:
        TrackUploadResponse with new track ID and metadata
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        logger.info(f"Beatoven poll for user {user_id}, task {task_id}")
        
        # Get original audio
        audio_bytes = await sb_storage.download_track_bytes(user_id=user_id, track_id=request.track_id)
        if audio_bytes is None:
            raise HTTPException(status_code=404, detail=f"Track {request.track_id} not found")
        
        # Get original metadata
        original_row = sb_storage.get_track(user_id=user_id, track_id=request.track_id)
        original_filename = original_row.get('filename', 'audio.wav') if original_row else 'audio.wav'
        
        # Process audio
        temp_file_path = None
        try:
            # Create temporary file
            file_ext = '.wav'
            if original_filename and '.' in original_filename:
                file_ext = '.' + original_filename.split('.')[-1].lower()
            
            with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_file:
                temp_file.write(audio_bytes)
                temp_file_path = temp_file.name
            
            # Load with librosa
            y, sr = librosa.load(temp_file_path, sr=None)
            
            # Extract harmonic components
            y_harmonic = get_harmonic_components(y)
            
            if len(y_harmonic) == 0:
                raise ValueError("Harmonic extraction resulted in empty audio")
            
            # Save processed audio to bytes
            processed_bytes = None
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as processed_file:
                sf.write(processed_file.name, y_harmonic, sr)
                processed_temp_path = processed_file.name
            
            with open(processed_temp_path, 'rb') as f:
                processed_bytes = f.read()
            
            if os.path.exists(processed_temp_path):
                os.unlink(processed_temp_path)
            
            # Create metadata for processed audio
            processed_metadata = {
                'duration_seconds': float(len(y_harmonic) / sr),
                'sample_rate': int(sr),
                'channels': 1 if len(y_harmonic.shape) == 1 else y_harmonic.shape[0],
                'processing_type': 'harmonic_extraction',
                'source_track_id': request.track_id,
                'original_duration': float(len(y) / sr)
            }
            
            # Generate new filename
            base_name = original_filename.split('.')[0] if original_filename else "audio"
            new_filename = f"harmonic_{base_name}.wav"
            
            # Store processed audio
            new_track_id = sb_storage.store_audio(
                user_id=user_id,
                audio_bytes=processed_bytes,
                filename=new_filename,
                metadata=processed_metadata,
                source_track_id=request.track_id,
            )
            
            # Get summary for response
            new_row = sb_storage.get_track(user_id=user_id, track_id=new_track_id)
            track_summary = {
                'track_id': new_row['track_id'],
                'filename': new_row['filename'],
                'file_size': new_row['size_bytes'],
                'created_at': new_row['created_at'],
                'duration_seconds': new_row.get('duration_seconds'),
                'sample_rate': new_row.get('sample_rate'),
                'channels': new_row.get('channels'),
                'processing_type': new_row.get('processing_type'),
            }
            
            logger.info(f"Successfully processed harmonic extraction: {request.track_id} -> {new_track_id}")
            
            return TrackUploadResponse(
                track_id=new_track_id,
                message=f"Harmonic extraction completed. New track: {new_track_id}",
                metadata=TrackReference(**track_summary)
            )
            
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Harmonic extraction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Harmonic extraction error: {str(e)}")


@app.post("/process/reverb", response_model=TrackUploadResponse)
async def process_reverb_by_id(request: ReverbProcessingRequest, authorization: str | None = Header(default=None)):
    """
    Apply reverb effect to a stored track using track ID.
    Returns a new track ID for the processed audio - perfect for AI agents.
    
    Args:
        request: ReverbProcessingRequest with track_id and reverb parameters
        
    Returns:
        TrackUploadResponse with new track ID and metadata
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        
        # Get original audio
        audio_bytes = await sb_storage.download_track_bytes(user_id=user_id, track_id=request.track_id)
        if audio_bytes is None:
            raise HTTPException(status_code=404, detail=f"Track {request.track_id} not found")
        
        # Get original metadata
        original_row = sb_storage.get_track(user_id=user_id, track_id=request.track_id)
        original_filename = original_row.get('filename', 'audio.wav') if original_row else 'audio.wav'
        
        # Process audio
        temp_file_path = None
        try:
            # Create temporary file
            file_ext = '.wav'
            if original_filename and '.' in original_filename:
                file_ext = '.' + original_filename.split('.')[-1].lower()
            
            with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_file:
                temp_file.write(audio_bytes)
                temp_file_path = temp_file.name
            
            # Load with librosa
            y, sr = librosa.load(temp_file_path, sr=None)
            
            # Apply reverb effect
            y_reverb = add_reverb(
                y, 
                sample_rate=sr, 
                room_size=request.room_size,
                damping=request.damping, 
                wet_level=request.wet_level, 
                dry_level=request.dry_level
            )
            
            if len(y_reverb) == 0:
                raise ValueError("Reverb processing resulted in empty audio")
            
            # Save processed audio to bytes
            processed_bytes = None
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as processed_file:
                sf.write(processed_file.name, y_reverb, sr)
                processed_temp_path = processed_file.name
            
            with open(processed_temp_path, 'rb') as f:
                processed_bytes = f.read()
            
            if os.path.exists(processed_temp_path):
                os.unlink(processed_temp_path)
            
            # Create metadata for processed audio
            processed_metadata = {
                'duration_seconds': float(len(y_reverb) / sr),
                'sample_rate': int(sr),
                'channels': 1 if len(y_reverb.shape) == 1 else y_reverb.shape[0],
                'processing_type': 'reverb',
                'source_track_id': request.track_id,
                'original_duration': float(len(y) / sr),
                'reverb_settings': {
                    'room_size': request.room_size,
                    'damping': request.damping,
                    'wet_level': request.wet_level,
                    'dry_level': request.dry_level
                }
            }
            
            # Generate new filename
            base_name = original_filename.split('.')[0] if original_filename else "audio"
            new_filename = f"reverb_{base_name}.wav"
            
            # Store processed audio
            new_track_id = sb_storage.store_audio(
                user_id=user_id,
                audio_bytes=processed_bytes,
                filename=new_filename,
                metadata=processed_metadata,
                source_track_id=request.track_id,
            )
            
            # Get summary for response
            new_row = sb_storage.get_track(user_id=user_id, track_id=new_track_id)
            track_summary = {
                'track_id': new_row['track_id'],
                'filename': new_row['filename'],
                'file_size': new_row['size_bytes'],
                'created_at': new_row['created_at'],
                'duration_seconds': new_row.get('duration_seconds'),
                'sample_rate': new_row.get('sample_rate'),
                'channels': new_row.get('channels'),
                'processing_type': new_row.get('processing_type'),
            }
            
            logger.info(f"Successfully processed reverb: {request.track_id} -> {new_track_id}")
            
            return TrackUploadResponse(
                track_id=new_track_id,
                message=f"Reverb processing completed. New track: {new_track_id}",
                metadata=TrackReference(**track_summary)
            )
            
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reverb processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Reverb processing error: {str(e)}")


@app.post("/process/chop-audio", response_model=ChopOutputWithIds)
async def chop_audio_by_id(request: ChopProcessingRequest, authorization: str | None = Header(default=None)):
    """
    Chop audio into segments using harmonic component analysis from a stored track.
    Returns track IDs for each chop - perfect for AI agents to minimize context usage.
    
    Args:
        request: ChopProcessingRequest with track_id and chopping parameters
        
    Returns:
        ChopOutputWithIds with track IDs for each chop and lightweight summaries
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        
        # Get original audio
        logger.info(f"Getting audio bytes for track {request.track_id}")
        audio_bytes = await sb_storage.download_track_bytes(user_id=user_id, track_id=request.track_id)
        if audio_bytes is None:
            raise HTTPException(status_code=404, detail=f"Track {request.track_id} not found")
        
        # Get original metadata
        original_row = sb_storage.get_track(user_id=user_id, track_id=request.track_id)
        original_filename = original_row.get('filename', 'audio.wav') if original_row else 'audio.wav'
        
        # Process audio
        temp_file_path = None
        try:
            # Create temporary file
            file_ext = '.wav'
            if original_filename and '.' in original_filename:
                file_ext = '.' + original_filename.split('.')[-1].lower()
            
            with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_file:
                temp_file.write(audio_bytes)
                temp_file_path = temp_file.name
            
            # Load with librosa
            y, sr = librosa.load(temp_file_path, sr=None)
            
            # Apply HPSS to get harmonic component
            y_harmonic, _ = librosa.effects.hpss(y)
            
            # Detect onsets on harmonic component
            onset_kwargs = dict(backtrack=True, pre_max=7, post_max=7, pre_avg=7, post_avg=7, delta=0.25, wait=0)
            oenv = librosa.onset.onset_strength(y=y_harmonic, sr=sr, hop_length=512)
            onset_frames = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=512, **onset_kwargs)
            onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=512)
            
            # Create chops from onsets
            chops_sec = []
            n = len(onset_times)
            for i, t in enumerate(onset_times):
                start = float(t)
                if i < n - 1:
                    end = float(onset_times[i + 1])
                    if end - start < request.min_duration:
                        end = start + request.default_length
                else:
                    end = start + request.default_length
                if end <= start:
                    end = start + request.min_duration
                chops_sec.append((start, end))
            
            if len(chops_sec) == 0:
                chops_sec = [(0.0, len(y_harmonic) / sr)]
            
            # Extract features and create chop data
            chop_track_ids = []
            chop_summaries = []
            feature_matrix = []
            
            for i, (start, end) in enumerate(chops_sec):
                duration = end - start
                
                # Extract audio slice
                start_sample = int(round(start * sr))
                end_sample = int(round(end * sr))
                y_slice = y_harmonic[start_sample:end_sample]
                
                # Extract features
                if y_slice.size == 0:
                    features = {
                        'rms': 0.0, 'centroid': 0.0, 'zcr': 0.0,
                        'chroma_mean': [0.0] * 12, 'mfcc_mean': [0.0] * 13,
                        'dominant_pc': None, 'dominant_note': None
                    }
                else:
                    features = {}
                    features['rms'] = float(np.mean(librosa.feature.rms(y=y_slice)[0]))
                    features['centroid'] = float(np.mean(librosa.feature.spectral_centroid(y=y_slice, sr=sr)[0]))
                    features['zcr'] = float(np.mean(librosa.feature.zero_crossing_rate(y_slice)[0]))
                    
                    chroma = librosa.feature.chroma_stft(y=y_slice, sr=sr)
                    features['chroma_mean'] = [float(x) for x in np.mean(chroma, axis=1)]
                    dom = int(np.argmax(features['chroma_mean'])) if np.array(features['chroma_mean']).size > 0 else None
                    features['dominant_pc'] = dom
                    features['dominant_note'] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][dom] if dom is not None else None
                    
                    mfcc = librosa.feature.mfcc(y=y_slice, sr=sr, n_mfcc=13)
                    features['mfcc_mean'] = [float(x) for x in np.mean(mfcc, axis=1)]
                
                # Save chop to bytes
                chop_bytes = None
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as chop_file:
                    sf.write(chop_file.name, y_slice, sr)
                    chop_temp_path = chop_file.name
                
                with open(chop_temp_path, 'rb') as f:
                    chop_bytes = f.read()
                
                if os.path.exists(chop_temp_path):
                    os.unlink(chop_temp_path)
                
                # Create metadata for chop
                chop_metadata = {
                    'duration_seconds': float(duration),
                    'sample_rate': int(sr),
                    'channels': 1 if len(y_slice.shape) == 1 else y_slice.shape[0],
                    'processing_type': 'harmonic_chop',
                    'source_track_id': request.track_id,
                    'chop_index': i,
                    'start_time': float(start),
                    'end_time': float(end),
                    'features': features
                }
                
                # Generate chop filename
                base_name = original_filename.split('.')[0] if original_filename else "audio"
                chop_filename = f"chop_{i:03d}_{base_name}.wav"
                
                # Store chop
                chop_track_id = sb_storage.store_audio(
                    user_id=user_id,
                    audio_bytes=chop_bytes,
                    filename=chop_filename,
                    metadata=chop_metadata,
                    source_track_id=request.track_id,
                )
                chop_track_ids.append(chop_track_id)
                
                # Get summary for response
                chop_row = sb_storage.get_track(user_id=user_id, track_id=chop_track_id)
                chop_summary = {
                    'track_id': chop_row['track_id'],
                    'filename': chop_row['filename'],
                    'file_size': chop_row['size_bytes'],
                    'created_at': chop_row['created_at'],
                    'duration_seconds': chop_row.get('duration_seconds'),
                    'sample_rate': chop_row.get('sample_rate'),
                    'channels': chop_row.get('channels'),
                    'processing_type': chop_row.get('processing_type'),
                }
                chop_summaries.append(TrackReference(**chop_summary))
                
                # Create feature vector for clustering
                feature_vec = [features['rms'], features['centroid'], features['zcr']] + features['mfcc_mean'][:4]
                feature_matrix.append(feature_vec)
            
            # Perform clustering if possible
            cluster_labels = []
            if len(feature_matrix) > 0:
                X = np.array(feature_matrix)
                try:
                    k = min(request.n_clusters, X.shape[0])
                    if k > 1:
                        scaler = StandardScaler()
                        X_scaled = scaler.fit_transform(X)
                        kmeans = KMeans(n_clusters=k, random_state=0, n_init=10).fit(X_scaled)
                        cluster_labels = kmeans.labels_.tolist()
                    else:
                        cluster_labels = [0] * len(chop_track_ids)
                        
                except Exception as e:
                    logger.warning(f"Clustering failed: {str(e)}")
                    cluster_labels = [0] * len(chop_track_ids)
            
            # Create metadata
            metadata = {
                "source_track_id": request.track_id,
                "original_filename": original_filename,
                "processing_type": "audio_chopping",
                "sample_rate": int(sr),
                "total_chops": len(chop_track_ids),
                "chopping_params": {
                    "default_length": request.default_length,
                    "min_duration": request.min_duration,
                    "n_clusters": request.n_clusters,
                    "max_chops": request.max_chops
                },
                "onset_detection": {
                    "onsets_detected": len(onset_times),
                    "onset_times": [float(t) for t in onset_times]
                },
                "cluster_labels": cluster_labels
            }
            
            # Apply smart chop selection if max_chops is less than total chops
            if len(chop_track_ids) > request.max_chops:
                logger.info(f"Selecting {request.max_chops} best chops from {len(chop_track_ids)} total chops")

                # Group chops by cluster
                cluster_groups = {}
                for i, label in enumerate(cluster_labels):
                    if label not in cluster_groups:
                        cluster_groups[label] = []
                    cluster_groups[label].append(i)

                # Calculate chops per cluster (aim to get at least one from each)
                n_clusters_actual = len(cluster_groups)
                base_per_cluster = max(1, request.max_chops // n_clusters_actual)
                remaining_chops = request.max_chops - (base_per_cluster * n_clusters_actual)

                selected_indices = []

                # Select representative chops from each cluster
                for cluster_id, chop_indices in cluster_groups.items():
                    chops_for_this_cluster = base_per_cluster
                    if remaining_chops > 0:
                        chops_for_this_cluster += 1
                        remaining_chops -= 1

                    # Sort chops in this cluster by RMS (energy) descending
                    cluster_chops_with_energy = []
                    for idx in chop_indices:
                        if idx < len(feature_matrix):
                            rms_energy = feature_matrix[idx][0]  # RMS is first feature
                            cluster_chops_with_energy.append((idx, rms_energy))

                    # Sort by energy and take the best ones
                    cluster_chops_with_energy.sort(key=lambda x: x[1], reverse=True)
                    selected_from_cluster = [idx for idx, _ in cluster_chops_with_energy[:chops_for_this_cluster]]
                    selected_indices.extend(selected_from_cluster)

                # Ensure we don't exceed max_chops
                selected_indices = selected_indices[:request.max_chops]

                # Filter the results to only include selected chops
                chop_track_ids = [chop_track_ids[i] for i in selected_indices]
                chop_summaries = [chop_summaries[i] for i in selected_indices]

                # Update cluster labels for selected chops
                cluster_labels = [cluster_labels[i] for i in selected_indices]

                # Update metadata
                metadata["total_chops"] = len(chop_track_ids)
                metadata["selection_info"] = {
                    "max_chops_requested": request.max_chops,
                    "original_chop_count": len(selected_indices),
                    "chops_per_cluster": base_per_cluster,
                    "clusters_used": n_clusters_actual,
                    "selected_indices": selected_indices
                }
                metadata["cluster_labels"] = cluster_labels

            logger.info(f"Successfully processed audio chopping: {request.track_id} -> {len(chop_track_ids)} chops")

            return ChopOutputWithIds(
                chop_track_ids=chop_track_ids,
                chop_summaries=chop_summaries,
                metadata=metadata
            )
            
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audio chopping error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Audio chopping error: {str(e)}")


@app.post("/process/speed", response_model=TrackUploadResponse)
async def process_speed_by_id(request: SpeedProcessingRequest, authorization: str | None = Header(default=None)):
    """
    Adjust the speed of a stored track using track ID.
    Returns a new track ID for the processed audio - perfect for AI agents.
    
    Args:
        request: SpeedProcessingRequest with track_id and speed_factor
        
    Returns:
        TrackUploadResponse with new track ID and metadata
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        
        # Get original audio
        audio_bytes = await sb_storage.download_track_bytes(user_id=user_id, track_id=request.track_id)
        if audio_bytes is None:
            raise HTTPException(status_code=404, detail=f"Track {request.track_id} not found")
        
        # Get original metadata
        original_row = sb_storage.get_track(user_id=user_id, track_id=request.track_id)
        original_filename = original_row.get('filename', 'audio.wav') if original_row else 'audio.wav'
        
        # Process audio
        temp_file_path = None
        try:
            # Create temporary file
            file_ext = '.wav'
            if original_filename and '.' in original_filename:
                file_ext = '.' + original_filename.split('.')[-1].lower()
            
            with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_file:
                temp_file.write(audio_bytes)
                temp_file_path = temp_file.name
            
            # Load with librosa
            y, sr = librosa.load(temp_file_path, sr=None)
            
            # Apply speed adjustment
            logger.info(f"Original audio: {len(y)} samples at {sr}Hz, duration: {len(y)/sr:.2f}s")
            y_speed_adjusted = adjust_speed(y, request.speed_factor)
            logger.info(f"Speed adjusted audio: {len(y_speed_adjusted)} samples, duration: {len(y_speed_adjusted)/sr:.2f}s, speed factor: {request.speed_factor}")
            
            if len(y_speed_adjusted) == 0:
                raise ValueError("Speed processing resulted in empty audio")
            
            # Save processed audio to bytes
            processed_bytes = None
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as processed_file:
                sf.write(processed_file.name, y_speed_adjusted, sr)
                processed_temp_path = processed_file.name
            
            with open(processed_temp_path, 'rb') as f:
                processed_bytes = f.read()
            
            if os.path.exists(processed_temp_path):
                os.unlink(processed_temp_path)
            
            # Create metadata for processed audio
            processed_metadata = {
                'duration_seconds': float(len(y_speed_adjusted) / sr),
                'sample_rate': int(sr),
                'channels': 1 if len(y_speed_adjusted.shape) == 1 else y_speed_adjusted.shape[0],
                'processing_type': 'speed_adjustment',
                'source_track_id': request.track_id,
                'original_duration': float(len(y) / sr),
                'speed_settings': {
                    'speed_factor': request.speed_factor
                }
            }
            
            # Generate new filename
            base_name = original_filename.split('.')[0] if original_filename else "audio"
            speed_description = f"{request.speed_factor}x" if request.speed_factor != 1.0 else "normal"
            new_filename = f"speed_{speed_description}_{base_name}.wav"
            
            # Store processed audio
            new_track_id = sb_storage.store_audio(
                user_id=user_id,
                audio_bytes=processed_bytes,
                filename=new_filename,
                metadata=processed_metadata,
                source_track_id=request.track_id,
            )
            
            # Get summary for response
            new_row = sb_storage.get_track(user_id=user_id, track_id=new_track_id)
            track_summary = {
                'track_id': new_row['track_id'],
                'filename': new_row['filename'],
                'file_size': new_row['size_bytes'],
                'created_at': new_row['created_at'],
                'duration_seconds': new_row.get('duration_seconds'),
                'sample_rate': new_row.get('sample_rate'),
                'channels': new_row.get('channels'),
                'processing_type': new_row.get('processing_type'),
            }
            
            logger.info(f"Successfully processed speed adjustment: {request.track_id} -> {new_track_id} (speed: {request.speed_factor}x)")
            
            return TrackUploadResponse(
                track_id=new_track_id,
                message=f"Speed adjustment completed ({request.speed_factor}x). New track: {new_track_id}",
                metadata=TrackReference(**track_summary)
            )
            
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Speed processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Speed processing error: {str(e)}")


@app.post("/start_track_generation")
async def start_track_generation(request: TrackGenerationRequest, authorization: str | None = Header(default=None)):
    """
    Start track generation using Beatoven AI API.
    
    Args:
        request: The track generation request containing prompt and options
        
    Returns:
        The task ID and status from Beatoven AI
    """
    try:
        # Prepare the payload for Beatoven AI
        payload = {
            "prompt": {
                "text": request.prompt.text
            },
            "format": request.format,
            "looping": request.looping
        }
        
        # Send request to Beatoven AI
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://public-api.beatoven.ai/api/v1/tracks/compose",
                json=payload,
                headers=get_beatoven_headers(),
                timeout=30.0
            )
            response.raise_for_status()
            
            # Return the response from Beatoven AI
            return response.json()
            
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Beatoven AI API error: {e.response.text}"
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Request to Beatoven AI failed: {str(e)}"
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        ) from e


class BeatovenTrackResponse(BaseModel):
    status: str
    track_id: Optional[str] = None
    stems: Optional[Dict[str, str]] = None
    metadata: Optional[Dict[str, Any]] = None

@app.get("/get_generated_track", response_model=BeatovenTrackResponse)
async def get_generated_track(task_id: str, authorization: str | None = Header(default=None)):
    """
    Get the status for a generated track. If completed, downloads all tracks (main + stems)
    and stores them in the storage system, returning track IDs for frontend access.

    Args:
        task_id: The task ID returned from start_track_generation

    Returns:
        BeatovenTrackResponse with status and stored track references
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)

        # Send request to Beatoven AI to check task status
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://public-api.beatoven.ai/api/v1/tasks/{task_id}",
                headers=get_beatoven_headers(),
                timeout=30.0
            )
            response.raise_for_status()

            task_data = response.json()

            # If track is still being processed, return the status
            if task_data.get("status") in ["running", "composing"]:
                return BeatovenTrackResponse(status=task_data.get("status", "unknown"))

            # If track is composed, download all tracks and store them
            if task_data.get("status") == "composed" and "meta" in task_data:
                meta = task_data["meta"]
                track_url = meta.get("track_url")
                stems_url = meta.get("stems_url", {})

                if not track_url:
                    raise HTTPException(status_code=500, detail="Track URL not found in response")

                # Download and store the main track
                logger.info(f"Downloading main track for task {task_id}")
                main_response = await client.get(track_url, timeout=60.0)
                main_response.raise_for_status()

                main_track_metadata = {
                    'processing_type': 'beatoven_main_track',
                    'beatoven_task_id': task_id,
                    'project_id': meta.get('project_id'),
                    'track_id': meta.get('track_id'),
                    'prompt': meta.get('prompt', {}),
                    'version': meta.get('version')
                }

                main_track_id = sb_storage.store_audio(
                    user_id=user_id,
                    audio_bytes=main_response.content,
                    filename=f"beatoven_track_{task_id}.mp3",
                    metadata=main_track_metadata,
                )
                logger.info(f"Stored main track as {main_track_id} for user {user_id}")

                # Download and store stems
                stored_stems = {}
                for stem_type, stem_url in stems_url.items():
                    if stem_url:
                        logger.info(f"Downloading {stem_type} stem for task {task_id}")
                        stem_response = await client.get(stem_url, timeout=60.0)
                        stem_response.raise_for_status()

                        stem_metadata = {
                            'processing_type': f'beatoven_stem_{stem_type}',
                            'beatoven_task_id': task_id,
                            'stem_type': stem_type,
                            'project_id': meta.get('project_id'),
                            'track_id': meta.get('track_id'),
                            'main_track_id': main_track_id
                        }

                        stem_track_id = sb_storage.store_audio(
                            user_id=user_id,
                            audio_bytes=stem_response.content,
                            filename=f"beatoven_{stem_type}_{task_id}.mp3",
                            metadata=stem_metadata,
                        )
                        stored_stems[stem_type] = stem_track_id
                        logger.info(f"Stored {stem_type} stem as {stem_track_id} for user {user_id}")

                response_metadata = {
                    'project_id': meta.get('project_id'),
                    'beatoven_track_id': meta.get('track_id'),
                    'prompt': meta.get('prompt', {}),
                    'version': meta.get('version'),
                    'total_tracks_stored': 1 + len(stored_stems),
                    'stems_available': list(stored_stems.keys())
                }

                return BeatovenTrackResponse(
                    status="composed",
                    track_id=main_track_id,
                    stems=stored_stems,
                    metadata=response_metadata
                )

            # For any other status, return the raw response
            return BeatovenTrackResponse(status=task_data.get("status", "unknown"))

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Beatoven AI API error: {e.response.text}"
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Request to Beatoven AI failed: {str(e)}"
        ) from e
    except Exception as e:
        logger.error(f"Error in get_generated_track: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        ) from e


@app.post("/start_mubert_generation")
async def start_mubert_generation(request: MubertGenerationRequest, authorization: str | None = Header(default=None)):
    """
    Start music track generation using the Mubert API.
    Returns a track ID to poll for completion status.

    Args:
        request: Mubert generation parameters including prompt, duration, etc.

    Returns:
        Response with track ID for status polling
    """
    try:
        payload = {
            "prompt": request.prompt,
            "duration": request.duration,
            "bitrate": request.bitrate,
            "mode": request.mode,
            "intensity": request.intensity,
            "format": request.format
        }

        # Send request to Mubert API to start generation
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://music-api.mubert.com/api/v3/public/tracks",
                json=payload,
                headers=get_mubert_headers(),
                timeout=30.0
            )
            response.raise_for_status()

            # Return the response from Mubert API (contains track ID)
            mubert_response = response.json()
            track_id = mubert_response["data"]["id"]

            return {
                "status": "started",
                "track_id": track_id,
                "mubert_data": mubert_response["data"]
            }

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Mubert API error: {e.response.text}"
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Request to Mubert API failed: {str(e)}"
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        ) from e


class MubertTrackResponse(BaseModel):
    status: str
    track_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

@app.get("/get_mubert_track", response_model=MubertTrackResponse)
async def get_mubert_track(track_id: str, authorization: str | None = Header(default=None)):
    """
    Get the status for a Mubert generated track. If completed, downloads the track
    and stores it in the storage system, returning track ID for frontend access.

    Args:
        track_id: The track ID returned from start_mubert_generation

    Returns:
        MubertTrackResponse with status and stored track reference
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)

        # Send request to Mubert API to check track status
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://music-api.mubert.com/api/v3/public/tracks/{track_id}",
                headers=get_mubert_headers(),
                timeout=30.0
            )
            response.raise_for_status()

            mubert_data = response.json()["data"]

            # Check generation status
            generations = mubert_data.get("generations", [])
            if not generations:
                return MubertTrackResponse(status="no_generations")

            generation = generations[0]  # Use first generation
            generation_status = generation.get("status", "unknown")

            # If track is still being processed, return the status
            if generation_status == "processing":
                return MubertTrackResponse(status="processing")

            # If track is completed, download and store it
            if generation_status == "done":
                track_url = generation.get("url")

                if not track_url:
                    raise HTTPException(status_code=500, detail="Track URL not found in response")

                # Download and store the track
                logger.info(f"Downloading Mubert track {track_id}")
                track_response = await client.get(track_url, timeout=60.0)
                track_response.raise_for_status()

                track_metadata = {
                    'processing_type': 'mubert_generation',
                    'mubert_track_id': track_id,
                    'prompt': mubert_data.get('prompt'),
                    'duration': mubert_data.get('duration'),
                    'intensity': mubert_data.get('intensity'),
                    'mode': mubert_data.get('mode'),
                    'bpm': mubert_data.get('bpm'),
                    'key': mubert_data.get('key'),
                    'generated_at': generation.get('generated_at'),
                    'format': generation.get('format'),
                    'bitrate': generation.get('bitrate')
                }

                stored_track_id = sb_storage.store_audio(
                    user_id=user_id,
                    audio_bytes=track_response.content,
                    filename=f"mubert_track_{track_id}.{generation.get('format', 'mp3')}",
                    metadata=track_metadata,
                )
                logger.info(f"Stored Mubert track as {stored_track_id}")

                response_metadata = {
                    'mubert_track_id': track_id,
                    'prompt': mubert_data.get('prompt'),
                    'duration': mubert_data.get('duration'),
                    'bpm': mubert_data.get('bpm'),
                    'key': mubert_data.get('key'),
                    'generated_at': generation.get('generated_at')
                }

                return MubertTrackResponse(
                    status="completed",
                    track_id=stored_track_id,
                    metadata=response_metadata
                )

            # For any other status, return the raw status
            return MubertTrackResponse(status=generation_status)

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Mubert API error: {e.response.text}"
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Request to Mubert API failed: {str(e)}"
        ) from e
    except Exception as e:
        logger.error(f"Error in get_mubert_track: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        ) from e

# Audio Storage and Management Endpoints

@app.post("/upload-audio", response_model=TrackUploadResponse)
async def upload_audio(file: UploadFile = File(...), request: Request = None, authorization: str | None = Header(default=None)):
    """
    Upload and store an audio file, returning a track ID for future reference.
    This endpoint is designed to minimize context usage for AI agents.
    
    Args:
        file: Audio file to upload
        
    Returns:
        TrackUploadResponse with track ID and metadata
    """
    try:
        logger.info(f"Processing audio upload: {file.filename}")
        
        # Validate file type
        if file.content_type and not file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail=f"Invalid content type: {file.content_type}")
        
        # Read file content
        audio_bytes = await file.read()
        
        if len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")
        
        # File size validation (100MB max)
        if len(audio_bytes) > 100 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 100MB)")
        
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        
        # Try to extract basic metadata without full processing
        audio_metadata = {'processing_type': 'original_upload'}
        
        # Only extract metadata if it's a reasonable file size
        if len(audio_bytes) < 50 * 1024 * 1024:  # Less than 50MB
            temp_file_path = None
            try:
                file_ext = '.wav'
                if file.filename and '.' in file.filename:
                    file_ext = '.' + file.filename.split('.')[-1].lower()
                
                with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_file:
                    temp_file.write(audio_bytes)
                    temp_file_path = temp_file.name
                
                # Load with librosa to get metadata
                y, sr = librosa.load(temp_file_path, sr=None)
                
                audio_metadata.update({
                    'duration_seconds': float(len(y) / sr),
                    'sample_rate': int(sr),
                    'channels': 1 if len(y.shape) == 1 else y.shape[0]
                })
                
            except Exception as e:
                logger.warning(f"Could not extract audio metadata: {e}")
            finally:
                if temp_file_path and os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
        
        # Store audio
        track_id = sb_storage.store_audio(
            user_id=user_id,
            audio_bytes=audio_bytes,
            filename=file.filename,
            metadata=audio_metadata,
        )
        
        # Get track summary for response
        row = sb_storage.get_track(user_id=user_id, track_id=track_id)
        track_summary = {
            'track_id': row['track_id'],
            'filename': row['filename'],
            'file_size': row['size_bytes'],
            'created_at': row['created_at'],
            'duration_seconds': row.get('duration_seconds'),
            'sample_rate': row.get('sample_rate'),
            'channels': row.get('channels'),
            'processing_type': row.get('processing_type'),
        }
        
        logger.info(f"Successfully uploaded audio as track {track_id}")
        
        return TrackUploadResponse(
            track_id=track_id,
            message=f"Audio uploaded successfully as track {track_id}",
            metadata=TrackReference(**track_summary)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audio upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Audio upload error: {str(e)}")


@app.get("/tracks", response_model=List[TrackReference])
async def list_tracks(limit: int = 100, authorization: str | None = Header(default=None)):
    """
    List all stored audio tracks with lightweight metadata.
    Perfect for AI agents to see available tracks without heavy context.
    
    Args:
        limit: Maximum number of tracks to return (default 100)
        
    Returns:
        List of track references with metadata
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        rows = sb_storage.list_tracks(user_id=user_id, limit=limit)
        
        return [
            TrackReference(
                track_id=row['track_id'],
                filename=row.get('filename'),
                file_size=row.get('size_bytes'),
                created_at=row.get('created_at'),
                duration_seconds=row.get('duration_seconds'),
                sample_rate=row.get('sample_rate'),
                channels=row.get('channels'),
                processing_type=row.get('processing_type'),
            ) for row in rows
        ]
        
    except Exception as e:
        logger.error(f"Error listing tracks: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing tracks: {str(e)}")


@app.get("/tracks/{track_id}", response_model=TrackReference)
async def get_track_info(track_id: str, authorization: str | None = Header(default=None)):
    """
    Get metadata for a specific track.
    
    Args:
        track_id: Unique track identifier
        
    Returns:
        Track metadata
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        row = sb_storage.get_track(user_id=user_id, track_id=track_id)
        
        if row is None:
            raise HTTPException(status_code=404, detail=f"Track {track_id} not found")
        
        return TrackReference(
            track_id=row['track_id'],
            filename=row.get('filename'),
            file_size=row.get('size_bytes'),
            created_at=row.get('created_at'),
            duration_seconds=row.get('duration_seconds'),
            sample_rate=row.get('sample_rate'),
            channels=row.get('channels'),
            processing_type=row.get('processing_type'),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting track info: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting track info: {str(e)}")


@app.get("/tracks/{track_id}/download")
async def download_track(track_id: str, authorization: str | None = Header(default=None)):
    """
    Download the actual audio file for a track.
    
    Args:
        track_id: Unique track identifier
        
    Returns:
        Audio file as response
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        row = sb_storage.get_track(user_id=user_id, track_id=track_id)
        if not row:
            raise HTTPException(status_code=404, detail=f"Track {track_id} not found")
        signed = sb_storage.get_signed_url(row['object_key'], 3600)
        return {"url": signed, "filename": row.get('filename')}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading track: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error downloading track: {str(e)}")


@app.delete("/tracks/{track_id}")
async def delete_track(track_id: str, authorization: str | None = Header(default=None)):
    """
    Delete a stored track.
    
    Args:
        track_id: Unique track identifier
        
    Returns:
        Success message
    """
    try:
        if not sb_storage:
            raise HTTPException(status_code=500, detail="Supabase storage not configured")
        user_id = await get_user_id_from_token(authorization)
        success = sb_storage.delete_track(user_id=user_id, track_id=track_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Track {track_id} not found")
        
        return {"message": f"Track {track_id} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting track: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting track: {str(e)}")


@app.get("/storage/stats", response_model=StorageStats)
async def get_storage_stats():
    """
    Get storage system statistics.
    
    Returns:
        Storage statistics
    """
    try:
        storage = get_audio_storage()
        stats = storage.get_storage_stats()
        
        return StorageStats(**stats)
        
    except Exception as e:
        logger.error(f"Error getting storage stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting storage stats: {str(e)}")


@app.post("/storage/cleanup")
async def cleanup_old_tracks():
    """
    Clean up old tracks based on max age configuration.
    
    Returns:
        Number of tracks cleaned up
    """
    try:
        storage = get_audio_storage()
        deleted_count = storage.cleanup_old_tracks()
        
        return {"message": f"Cleaned up {deleted_count} old tracks"}
        
    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during cleanup: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "message": "Lavoe Audio Processing API is running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
