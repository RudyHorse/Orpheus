import os
import sys
import uuid
import shutil
import logging
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydub import AudioSegment

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

log_file = LOG_DIR / f"app_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("orpheus")

app = FastAPI(title="Orpheus API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = Path("temp_files")
TEMP_DIR.mkdir(exist_ok=True)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"Response status: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Request failed: {str(e)}", exc_info=True)
        raise


def format_duration(ms: int) -> str:
    total_seconds = ms // 1000
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def format_file_size(bytes_size: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024
    return f"{bytes_size:.2f} TB"


@app.get("/")
async def root():
    logger.info("Root endpoint accessed")
    return {"message": "MP3 Cutter API is running"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    logger.info(f"Upload request received: {file.filename}")
    
    if not file.filename or not file.filename.lower().endswith(".mp3"):
        logger.warning(f"Invalid file type attempted: {file.filename}")
        raise HTTPException(status_code=400, detail="Only MP3 files are allowed")
    
    file_id = str(uuid.uuid4())
    file_path = TEMP_DIR / f"{file_id}.mp3"
    logger.info(f"Generated file ID: {file_id}")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"File saved to temporary location: {file_path}")
        
        audio = AudioSegment.from_mp3(str(file_path))
        duration_ms = len(audio)
        duration_formatted = format_duration(duration_ms)
        file_size = file_path.stat().st_size
        file_size_formatted = format_file_size(file_size)
        
        logger.info(f"File processed successfully: {file.filename}, duration: {duration_formatted}")
        
        return {
            "file_id": file_id,
            "filename": file.filename,
            "duration_ms": duration_ms,
            "duration_formatted": duration_formatted,
            "channels": audio.channels,
            "sample_width": audio.sample_width,
            "sample_width_formatted": f"{audio.sample_width * 8} bits",
            "frame_rate": audio.frame_rate,
            "frame_rate_formatted": f"{audio.frame_rate} Hz",
            "file_size": file_size,
            "file_size_formatted": file_size_formatted,
        }
    except Exception as e:
        logger.error(f"Failed to process uploaded file: {str(e)}", exc_info=True)
        if file_path.exists():
            file_path.unlink()
            logger.info(f"Cleaned up temporary file: {file_path}")
        raise HTTPException(status_code=400, detail=f"Failed to process MP3 file: {str(e)}")


from typing import Optional
from pydantic import BaseModel

class CutRequest(BaseModel):
    num_parts: int
    output_dir: str


@app.post("/cut/{file_id}")
async def cut_file(file_id: str, request: CutRequest):
    num_parts = request.num_parts
    output_dir = request.output_dir
    logger.info(f"Cut request: file_id={file_id}, num_parts={num_parts}, output_dir={output_dir}")
    
    if not 2 <= num_parts <= 10:
        logger.warning(f"Invalid number of parts requested: {num_parts}")
        raise HTTPException(status_code=400, detail="Number of parts must be between 2 and 10")
    
    file_path = TEMP_DIR / f"{file_id}.mp3"
    if not file_path.exists():
        logger.error(f"File not found in temp storage: {file_id}")
        raise HTTPException(status_code=404, detail="File not found. Please upload again.")
    
    output_path = Path(output_dir)
    if not output_path.exists():
        try:
            output_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"Created output directory: {output_path}")
        except Exception as e:
            logger.error(f"Failed to create output directory: {str(e)}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"Invalid output directory: {str(e)}")
    
    try:
        logger.info("Loading audio file for processing...")
        audio = AudioSegment.from_mp3(str(file_path))
        total_duration = len(audio)
        part_duration = total_duration / num_parts
        
        logger.info(f"Audio loaded: total_duration={total_duration}ms, part_duration={part_duration}ms")
        
        output_files = []
        for i in range(num_parts):
            start_ms = int(i * part_duration)
            end_ms = int((i + 1) * part_duration)
            
            if i == num_parts - 1:
                end_ms = total_duration
            
            part = audio[start_ms:end_ms]
            output_filename = f"part_{i + 1}.mp3"
            output_file_path = output_path / output_filename
            
            counter = 1
            while output_file_path.exists():
                output_filename = f"part_{i + 1}_{counter}.mp3"
                output_file_path = output_path / output_filename
                counter += 1
            
            part.export(str(output_file_path), format="mp3")
            logger.info(f"Exported part {i + 1}: {output_filename} ({start_ms}ms - {end_ms}ms)")
            
            output_files.append({
                "filename": output_filename,
                "path": str(output_file_path),
                "start_time": format_duration(start_ms),
                "end_time": format_duration(end_ms),
            })
        
        file_path.unlink()
        logger.info(f"Cleaned up source file: {file_path}")
        
        logger.info(f"Cutting completed successfully: {num_parts} parts created")
        return {
            "success": True,
            "num_parts": num_parts,
            "files": output_files,
        }
    except Exception as e:
        logger.error(f"Failed to cut file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to cut file: {str(e)}")


if __name__ == "__main__":
    logger.info("=" * 50)
    logger.info("MP3 Cutter API starting...")
    logger.info(f"Log file: {log_file}")
    logger.info("=" * 50)
    
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
