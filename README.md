# MP3 to Text Converter

A web application for converting MP3 audio files to text using the **GigaAM-v3** speech recognition model created by SberDevices.

## Architecture

- **Frontend**: React with Vite
- **Backend**: Python FastAPI
- **Model**: GigaAM-v3 (Automatic Speech Recognition)
- **Output**: Text files in .doc format

## Prerequisites

- Python 3.10, 3.11, or 3.12 (REQUIRED - Python 3.13/3.14 NOT supported)
- Node.js 18+
- npm or yarn
- CUDA-compatible GPU (recommended for faster processing, but CPU is also supported)

## Installation

### 1. Check Python Version

```bash
python --version
```

**IMPORTANT:** GigaAM-v3 requires Python 3.10, 3.11, or 3.12. Python 3.13+ is NOT supported by torch 2.8.0.

If you need a different Python version, install it from [python.org](https://www.python.org/downloads/) or use py launcher:

```bash
py -3.12 --version
```

### 2. Set Up Python Virtual Environment (Backend)

**Windows:**
```bash
cd backend
py -3.12 -m venv venv
venv\Scripts\activate
```

**Linux/macOS:**
```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
```

### 3. Install Python Dependencies

Install all required packages:

```bash
pip install -r requirements.txt
```

If that fails, install packages sequentially:

```bash
pip install sentencepiece omegaconf hydra-core
pip install pyannote.audio accelerate torchcodec
pip install -r requirements.txt
```

**Required packages:**
- `torch==2.8.0` / `torchaudio==2.8.0` (or higher)
- `transformers>=4.57.1`
- `hydra-core>=1.3`
- `omegaconf>=2.3.0`
- `sentencepiece>=0.2.0`
- `pyannote-audio>=4.0.0`
- `torchcodec>=0.7.0`
- `accelerate>=0.20.0`

**GPU support (optional):**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
```

### 4. Install Node.js Dependencies (Frontend)

```bash
cd frontend
npm install
```

## Running the Application

### Step 1: Start the Backend Server

In one terminal, start the FastAPI backend:

```bash
cd backend
python main.py
```

Or using uvicorn directly:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at `http://localhost:8000`

### Step 2: Start the Frontend Development Server

In another terminal, start the React frontend:

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Step 3: Open the Application

Open your Chromium-based browser and navigate to:
```
http://localhost:5173
```

### Quick Start (Windows)

Double-click `start_orpheus.bat` to launch both backend and frontend with one click.

## Usage

1. **Select Audio File**: Click "Browse" to select your MP3/WAV/FLAC file
2. **Convert**: Click "Convert to Text" to transcribe the audio
3. **Save**: Enter the output path and click "Save as DOC" to save as Word document

### Supported Audio Formats
- MP3, WAV, FLAC, M4A, OGG

## Troubleshooting

### Python Version Error
If you get "Python 3.14 isn't supported":
```bash
py -3.12 -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Missing Package Errors
If you get "requires the following packages that were not found":
```bash
pip install sentencepiece omegaconf hydra-core pyannote.audio accelerate torchcodec
```

### Device Map Error
If you get "requires accelerate":
```bash
pip install accelerate
```

### Model Download Issues
Ensure you have access to Hugging Face:
```bash
huggingface-cli login
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/model-info` | Get model loading status |
| POST | `/api/transcribe` | Transcribe audio file |
| POST | `/api/save-doc` | Save text as .doc file |
| GET | `/api/health` | Health check |

## License

MIT License - GigaAM-v3 model is licensed under MIT.