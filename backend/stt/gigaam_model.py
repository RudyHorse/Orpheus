import os
import sys
import torch
import torchaudio
from transformers import AutoModel

MODEL_REVISION = "e2e_rnnt"

MAX_AUDIO_LENGTH_SECONDS = 30
CHUNK_OVERLAP_SECONDS = 1


def set_num_threads(num_threads: int = 1) -> None:
    """Set number of CPU threads for inference"""
    torch.set_num_threads(num_threads)


def split_audio_chunks(audio_path: str, max_duration: int = MAX_AUDIO_LENGTH_SECONDS, overlap: int = CHUNK_OVERLAP_SECONDS):
    """Split long audio into chunks"""
    waveform, sample_rate = torchaudio.load(audio_path)
    
    if sample_rate != 16000:
        waveform = torchaudio.functional.resample(waveform, sample_rate, 16000)
        sample_rate = 16000
    
    total_duration = waveform.shape[1] / sample_rate
    
    if total_duration <= max_duration:
        return [audio_path], None
    
    chunk_samples = max_duration * sample_rate
    hop_samples = (max_duration - overlap) * sample_rate
    
    chunks = []
    temp_dir = os.path.dirname(audio_path) or "."
    temp_prefix = os.path.splitext(os.path.basename(audio_path))[0]
    
    for i in range(0, waveform.shape[1], hop_samples):
        start = i
        end = min(i + chunk_samples, waveform.shape[1])
        chunk_waveform = waveform[:, start:end]
        
        chunk_path = os.path.join(temp_dir, f"{temp_prefix}_chunk_{i}.wav")
        torchaudio.save(chunk_path, chunk_waveform, sample_rate)
        chunks.append(chunk_path)
        
        if end >= waveform.shape[1]:
            break
    
    return chunks, temp_dir


def transcribe_longform(audio_path: str) -> str:
    """Transcribe long audio file by splitting into chunks"""
    model = gigaam_model.load_model()
    
    chunks, temp_dir = split_audio_chunks(audio_path)
    
    if len(chunks) == 1:
        result = model.transcribe(audio_path)
        return result.get("text", "")
    
    texts = []
    for i, chunk_path in enumerate(chunks):
        print(f"Transcribing chunk {i+1}/{len(chunks)}...")
        result = model.transcribe(chunk_path)
        text = result.get("text", "")
        if text:
            texts.append(text)
        
        if temp_dir and os.path.exists(chunk_path):
            try:
                os.unlink(chunk_path)
            except Exception:
                pass
    
    final_text = " ".join(texts)
    
    temp_prefix = os.path.splitext(os.path.basename(audio_path))[0]
    for f in os.listdir(temp_dir or "."):
        if f.startswith(f"{temp_prefix}_chunk_") and f.endswith(".wav"):
            try:
                os.unlink(os.path.join(temp_dir, f))
            except Exception:
                pass
    
    return final_text


class GigaAMModel:
    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load_model(self, revision: str = MODEL_REVISION):
        if self._model is None:
            model_path = os.environ.get("GIGAAM_MODEL_PATH", "ai-sage/GigaAM-v3")
            print(f"Loading GigaAM-v3 model ({revision})...")

            if model_path == "ai-sage/GigaAM-v3":
                try:
                    self._model = AutoModel.from_pretrained(
                        model_path,
                        revision=revision,
                        trust_remote_code=True,
                        torch_dtype=torch.float32,
                        device_map="cpu",
                        local_files_only=True
                    )
                    print("Model loaded from cache!")
                except EnvironmentError:
                    print("Model not in cache, downloading from HuggingFace...")
                    os.environ["HF_HUB_DOWNLOAD_TIMEOUT"] = "120"
                    self._model = AutoModel.from_pretrained(
                        model_path,
                        revision=revision,
                        trust_remote_code=True,
                        torch_dtype=torch.float32,
                        device_map="cpu"
                    )
                    print("Model downloaded and loaded!")
            else:
                self._model = AutoModel.from_pretrained(
                    model_path,
                    trust_remote_code=True,
                    torch_dtype=torch.float32,
                    device_map="cpu"
                )
                print("Model loaded from local path!")
        return self._model

    def transcribe(self, audio_path: str) -> str:
        if self._model is None:
            self.load_model()

        try:
            result = self._model.transcribe(audio_path)
            if isinstance(result, dict):
                return result.get("text", "")
            return str(result) if result else ""
        except ValueError as e:
            if "Too long wav file" in str(e):
                print(f"File too long, using manual chunking...")
                return self._manual_longform(audio_path)
            raise
        
    def _manual_longform(self, audio_path: str) -> str:
        """Manual longform without pyannote VAD - just splits audio into fixed-size chunks"""
        model = self._model
        
        waveform, sample_rate = torchaudio.load(audio_path)
        
        if sample_rate != 16000:
            waveform = torchaudio.functional.resample(waveform, sample_rate, 16000)
            sample_rate = 16000
        
        total_duration = waveform.shape[1] / sample_rate
        
        if total_duration <= MAX_AUDIO_LENGTH_SECONDS:
            result = model.transcribe(audio_path)
            if isinstance(result, dict):
                return result.get("text", "")
            return str(result) if result else ""
        
        chunk_samples = MAX_AUDIO_LENGTH_SECONDS * sample_rate
        hop_samples = (MAX_AUDIO_LENGTH_SECONDS - CHUNK_OVERLAP_SECONDS) * sample_rate
        
        texts = []
        
        for i in range(0, waveform.shape[1], hop_samples):
            start = i
            end = min(i + chunk_samples, waveform.shape[1])
            chunk_waveform = waveform[:, start:end]
            
            import tempfile
            import warnings
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav', mode='wb') as f:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    torchaudio.save(f.name, chunk_waveform, sample_rate)
            
            try:
                result = model.transcribe(f.name)
                if isinstance(result, dict):
                    text = result.get("text", "")
                else:
                    text = str(result) if result else ""
                if text:
                    texts.append(text)
            finally:
                try:
                    os.unlink(f.name)
                except Exception:
                    pass
        
        return " ".join(texts)

    def get_model_info(self) -> dict:
        return {
            "model_type": "GigaAM-v3",
            "revision": MODEL_REVISION,
            "loaded": self._model is not None
        }


def check_python_version():
    """Check if Python version is compatible with torch 2.8.0"""
    version = sys.version_info
    if version.major == 3 and version.minor >= 13:
        print(f"WARNING: Python 3.{version.minor} is NOT supported by torch 2.8.0")
        print("GigaAM-v3 requires Python 3.10, 3.11, or 3.12")
        print(f"Current: Python {version.major}.{version.minor}.{version.micro}")
        return False
    return True


check_python_version()
gigaam_model = GigaAMModel()
