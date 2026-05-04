import asyncio
import csv
import logging
import os
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List

import torchaudio
from docx import Document
from docx.shared import Pt
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from stt.gigaam_model import gigaam_model, set_num_threads

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Orpheus",
    description="MP3 to Text converter using GigaAM-v3 model",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_MB = 100
MAX_CHUNK_DURATION_SEC = 25
CHUNK_OVERLAP_SEC = 1
OUTPUT_DIR = Path("./output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

LOG_FILE = Path("orphrus.log")
LOG_HEADER = ["number", "date", "file_name", "duration", "file_size", "run_time", "num_chunks", "cpu_cores"]

stop_events = {}
transcription_locks = {}
transcription_progress = {}

if not LOG_FILE.exists():
    with open(LOG_FILE, 'w', newline='') as f:
        writer = csv.writer(f, delimiter='\t')
        writer.writerow(LOG_HEADER)


class TranscriptionResponse(BaseModel):
    text: str
    success: bool
    error: Optional[str] = None
    audio_info: Optional[dict] = None
    runtime_seconds: Optional[float] = None
    runtime_formatted: Optional[str] = None
    progress: Optional[int] = None
    transcription_id: Optional[str] = None


class ProgressResponse(BaseModel):
    current_chunk: int
    total_chunks: int
    status: str


class SaveRequest(BaseModel):
    text: str
    output_path: str


class SaveResponse(BaseModel):
    success: bool
    message: str
    file_path: Optional[str] = None


class ModelInfoResponse(BaseModel):
    loaded: bool
    model_type: str
    revision: str


SUPPORTED_FORMATS = ('.mp3', '.wav', '.flac', '.m4a', '.ogg')


def get_log_count():
    if not LOG_FILE.exists():
        return 0
    with open(LOG_FILE, 'r') as f:
        lines = [l for l in f.readlines() if l.strip() and not l.startswith('number')]
        return len(lines)


def save_log_entry(file_name, duration, file_size_mb, run_time, num_chunks, cpu_cores):
    number = get_log_count() + 1
    date = datetime.now().strftime('%Y-%m-%d')
    hours = int(duration // 3600)
    mins = int((duration % 3600) // 60)
    secs = int(duration % 60)
    duration_str = f"{hours}:{mins:02d}:{secs:02d}" if hours > 0 else f"{mins:02d}:{secs:02d}"
    hours_r = int(run_time // 3600)
    mins_r = int((run_time % 3600) // 60)
    secs_r = int(run_time % 60)
    runtime_formatted = f"{hours_r:02d}:{mins_r:02d}:{secs_r:02d}"
    file_size_str = f"{file_size_mb:.1f} Mb"
    with open(LOG_FILE, 'a', newline='') as f:
        writer = csv.writer(f, delimiter='\t')
        writer.writerow([number, date, file_name, duration_str, file_size_str, runtime_formatted, num_chunks, cpu_cores])
    logger.info(f"Log entry #{number} saved")


def validate_file_format(filename: Optional[str]) -> bool:
    if not filename:
        return False
    return filename.lower().endswith(SUPPORTED_FORMATS)


def get_audio_info(file_path: str, file_size: int) -> dict:
    info = torchaudio.info(file_path)
    duration_sec = info.num_frames / info.sample_rate
    hours = int(duration_sec // 3600)
    minutes = int((duration_sec % 3600) // 60)
    seconds = int(duration_sec % 60)
    return {
        "duration_formatted": f"{hours:02d}:{minutes:02d}:{seconds:02d}",
        "duration_seconds": round(duration_sec, 2),
        "channels": info.num_channels,
        "sample_rate": info.sample_rate,
        "file_size_mb": round(file_size / (1024 * 1024), 2)
    }


def calculate_num_chunks(duration_seconds: float) -> int:
    if duration_seconds <= MAX_CHUNK_DURATION_SEC:
        return 1
    effective_chunk = MAX_CHUNK_DURATION_SEC - CHUNK_OVERLAP_SEC
    num_chunks = int((duration_seconds - MAX_CHUNK_DURATION_SEC) / effective_chunk) + 2
    return max(1, num_chunks)


def split_audio_into_chunks(audio_path: str, num_chunks: int) -> List[str]:
    waveform, sample_rate = torchaudio.load(audio_path)
    if sample_rate != 16000:
        waveform = torchaudio.functional.resample(waveform, sample_rate, 16000)
        sample_rate = 16000
    total_samples = waveform.shape[1]
    chunk_samples = MAX_CHUNK_DURATION_SEC * sample_rate
    hop_samples = (MAX_CHUNK_DURATION_SEC - CHUNK_OVERLAP_SEC) * sample_rate
    temp_dir = os.path.dirname(audio_path) or "."
    temp_prefix = os.path.splitext(os.path.basename(audio_path))[0]
    chunks = []
    for i in range(num_chunks):
        start = i * hop_samples
        end = min(start + chunk_samples, total_samples)
        chunk_waveform = waveform[:, start:end]
        chunk_path = os.path.join(temp_dir, f"{temp_prefix}_chunk_{i}.wav")
        torchaudio.save(chunk_path, chunk_waveform, sample_rate)
        chunks.append(chunk_path)
        if end >= total_samples:
            break
    return chunks


def cleanup_files(files: List[Optional[str]]) -> None:
    for file_path in files:
        try:
            if file_path and os.path.exists(file_path):
                os.unlink(file_path)
        except Exception as e:
            logger.warning(f"Failed to cleanup {file_path}: {e}")


@app.on_event("startup")
async def startup_event():
    logger.info("Starting Orpheus API...")
    set_num_threads(1)


@app.get("/")
async def root():
    return {"message": "Orpheus API", "version": "1.0.0"}


@app.get("/api/model-info", response_model=ModelInfoResponse)
async def get_model_info():
    info = gigaam_model.get_model_info()
    return ModelInfoResponse(**info)


@app.post("/api/settings")
async def update_settings(num_threads: int = 1):
    num_threads = max(1, min(4, num_threads))
    set_num_threads(num_threads)
    logger.info(f"CPU threads set to: {num_threads}")
    return {"success": True, "cpu_threads": num_threads}


@app.get("/api/settings")
async def get_settings():
    import torch
    return {"cpu_threads": torch.get_num_threads()}


@app.post("/api/stop")
async def stop_transcription(tid: str = ""):
    logger.info(f"Stop requested for: {tid}")
    if tid:
        if tid in stop_events:
            stop_events[tid].set()
    else:
        for se in stop_events.values():
            se.set()
    return {"success": True, "message": "Stop requested"}


@app.get("/api/progress/{tid}")
async def get_progress(tid: str):
    if tid in transcription_progress:
        return ProgressResponse(
            current_chunk=transcription_progress[tid].get("current_chunk", 0),
            total_chunks=transcription_progress[tid].get("total_chunks", 0),
            status=transcription_progress[tid].get("status", "processing")
        )
    return ProgressResponse(current_chunk=0, total_chunks=0, status="not_found")


@app.post("/api/audio-info")
async def get_audio_info_endpoint(file: UploadFile = File(...)):
    if not validate_file_format(file.filename):
        return {"success": False, "error": "Unsupported file format"}
    
    temp_audio_path = None
    try:
        content = await file.read()
        file_size_mb = len(content) / (1024 * 1024)
        if file_size_mb > MAX_FILE_SIZE_MB:
            return {"success": False, "error": f"File too large. Max {MAX_FILE_SIZE_MB}MB"}
        
        suffix = Path(file.filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_audio_path = temp_file.name
        
        audio_info = get_audio_info(temp_audio_path, len(content))
        duration = audio_info["duration_seconds"]
        num_chunks = calculate_num_chunks(duration)
        audio_info["num_chunks"] = num_chunks
        audio_info["max_chunk_duration"] = MAX_CHUNK_DURATION_SEC
        return {"success": True, "audio_info": audio_info}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        cleanup_files([temp_audio_path])


def run_transcription(transcription_id: str, content: bytes, filename: str, result_container: dict):
    """Run transcription in a separate thread"""
    stop_event = stop_events.get(transcription_id)
    temp_audio_path = None
    chunk_paths = []
    start_time = time.time()
    
    transcription_progress[transcription_id] = {"current_chunk": 0, "total_chunks": 0, "status": "starting"}
    
    try:
        file_size_mb = len(content) / (1024 * 1024)
        
        suffix = Path(filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_audio_path = temp_file.name
        
        if stop_event and stop_event.is_set():
            result_container["result"] = {"text": "", "success": False, "error": "Transcription stopped by user"}
            transcription_progress[transcription_id] = {"current_chunk": 0, "total_chunks": 0, "status": "stopped"}
            return
        
        audio_info = get_audio_info(temp_audio_path, len(content))
        duration = audio_info["duration_seconds"]
        num_chunks = calculate_num_chunks(duration)
        
        transcription_progress[transcription_id] = {"current_chunk": 0, "total_chunks": num_chunks, "status": "processing"}
        
        if num_chunks > 1:
            chunk_paths = split_audio_into_chunks(temp_audio_path, num_chunks)
            logger.info(f"Split into {len(chunk_paths)} chunks")
            texts = []
            for i, chunk_path in enumerate(chunk_paths):
                if stop_event and stop_event.is_set():
                    result_container["result"] = {"text": "", "success": False, "error": "Transcription stopped by user"}
                    transcription_progress[transcription_id] = {"current_chunk": i, "total_chunks": len(chunk_paths), "status": "stopped"}
                    return
                logger.info(f"Processing chunk {i+1}/{len(chunk_paths)}...")
                transcription_progress[transcription_id] = {"current_chunk": i + 1, "total_chunks": len(chunk_paths), "status": "processing"}
                chunk_text = gigaam_model.transcribe(chunk_path)
                texts.append(chunk_text)
            text = " ".join(texts)
        else:
            if stop_event and stop_event.is_set():
                result_container["result"] = {"text": "", "success": False, "error": "Transcription stopped by user"}
                transcription_progress[transcription_id] = {"current_chunk": 0, "total_chunks": 1, "status": "stopped"}
                return
            transcription_progress[transcription_id] = {"current_chunk": 1, "total_chunks": 1, "status": "processing"}
            text = gigaam_model.transcribe(temp_audio_path)
        
        if stop_event and stop_event.is_set():
            result_container["result"] = {"text": "", "success": False, "error": "Transcription stopped by user"}
            transcription_progress[transcription_id] = {"current_chunk": 0, "total_chunks": num_chunks, "status": "stopped"}
            return
        
        import torch
        runtime_seconds = time.time() - start_time
        minutes = int(runtime_seconds // 60)
        seconds = int(runtime_seconds % 60)
        runtime_formatted = f"{minutes:02d}:{seconds:02d}"
        cpu_cores = torch.get_num_threads()
        save_log_entry(filename, duration, file_size_mb, runtime_seconds, num_chunks, cpu_cores)
        
        result_container["result"] = {
            "text": text,
            "success": True,
            "audio_info": audio_info,
            "runtime_seconds": round(runtime_seconds, 2),
            "runtime_formatted": runtime_formatted
        }
        transcription_progress[transcription_id] = {"current_chunk": num_chunks, "total_chunks": num_chunks, "status": "completed", "result": result_container["result"]}
    except Exception as e:
        logger.exception("Transcription failed")
        result_container["result"] = {"text": "", "success": False, "error": str(e)}
        transcription_progress[transcription_id] = {"current_chunk": 0, "total_chunks": 0, "status": "error", "result": {"error": str(e)}}
    finally:
        cleanup_files(chunk_paths + [temp_audio_path])
        if transcription_id in stop_events:
            del stop_events[transcription_id]


class TranscriptionStartResponse(BaseModel):
    transcription_id: str
    success: bool
    error: Optional[str] = None


@app.post("/api/transcribe-start", response_model=TranscriptionStartResponse)
async def start_transcription(file: UploadFile = File(...)):
    if not validate_file_format(file.filename):
        return TranscriptionStartResponse(transcription_id="", success=False, error="Unsupported file format")
    
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        return TranscriptionStartResponse(transcription_id="", success=False, error=f"File too large. Max {MAX_FILE_SIZE_MB}MB")
    
    transcription_id = str(uuid.uuid4())
    stop_event = threading.Event()
    stop_events[transcription_id] = stop_event
    
    result_container = {}
    
    thread = threading.Thread(target=run_transcription, args=(transcription_id, content, file.filename, result_container))
    thread.start()
    
    return TranscriptionStartResponse(transcription_id=transcription_id, success=True)


@app.get("/api/transcribe-result/{tid}")
async def get_transcription_result(tid: str):
    if tid not in transcription_progress:
        return TranscriptionResponse(text="", success=False, error="Transcription not found")
    
    progress_info = transcription_progress[tid]
    status = progress_info.get("status", "")
    
    if status == "completed":
        result = progress_info.get("result", {})
        transcription_progress.pop(tid, None)
        return TranscriptionResponse(
            text=result.get("text", ""),
            success=True,
            audio_info=result.get("audio_info"),
            runtime_seconds=result.get("runtime_seconds"),
            runtime_formatted=result.get("runtime_formatted")
        )
    elif status == "error" or status == "stopped":
        result = progress_info.get("result", {})
        transcription_progress.pop(tid, None)
        return TranscriptionResponse(text="", success=False, error=result.get("error", "Unknown error"))
    
    return TranscriptionResponse(text="", success=False, error="Transcription in progress")


@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    if not validate_file_format(file.filename):
        return TranscriptionResponse(text="", success=False, error="Unsupported file format")
    
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        return TranscriptionResponse(text="", success=False, error=f"File too large. Max {MAX_FILE_SIZE_MB}MB")
    
    transcription_id = str(uuid.uuid4())
    stop_event = threading.Event()
    stop_events[transcription_id] = stop_event
    
    result_container = {}
    
    thread = threading.Thread(target=run_transcription, args=(transcription_id, content, file.filename, result_container))
    thread.start()
    
    while thread.is_alive():
        await asyncio.sleep(0.5)
        if stop_event.is_set():
            break
    
    thread.join(timeout=1)
    
    if transcription_id in stop_events:
        del stop_events[transcription_id]
    
    if "result" not in result_container:
        return TranscriptionResponse(text="", success=False, error="Transcription timeout")
    
    result = result_container["result"]
    
    if result["success"]:
        transcription_progress.pop(transcription_id, None)
        return TranscriptionResponse(
            text=result["text"],
            success=True,
            audio_info=result["audio_info"],
            runtime_seconds=result["runtime_seconds"],
            runtime_formatted=result["runtime_formatted"]
        )
    else:
        transcription_progress.pop(transcription_id, None)
        return TranscriptionResponse(text="", success=False, error=result.get("error", "Unknown error"))


@app.post("/api/save-doc", response_model=SaveResponse)
async def save_as_doc(request: SaveRequest):
    try:
        output_path = Path(request.output_path)
        if output_path.suffix.lower() != '.doc':
            output_path = output_path.with_suffix('.doc')
        output_path.parent.mkdir(parents=True, exist_ok=True)
        doc = Document()
        for paragraph_text in request.text.split('\n'):
            doc.add_paragraph(paragraph_text)
        doc.save(str(output_path))
        return SaveResponse(success=True, message="Document saved", file_path=str(output_path.resolve()))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)