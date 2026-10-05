import os
import torch
from transformers import pipeline


class WhisperModel:

    def __init__(self, model_size: str = "small"):
        self._model_size = model_size
        self._pipeline = None

    def load_model(self):
        if self._pipeline is None:
            print(f"Loading Whisper {self._model_size} model...")
            os.environ["HF_HUB_DOWNLOAD_TIMEOUT"] = "120"
            self._pipeline = pipeline(
                "automatic-speech-recognition",
                model=f"openai/whisper-{self._model_size}",
                torch_dtype=torch.float32,
                device="cpu"
            )
            print("Whisper model loaded!")
        return self._pipeline

    def transcribe(self, audio_path: str) -> str:
        if self._pipeline is None:
            self.load_model()
        result = self._pipeline(audio_path)
        if isinstance(result, dict):
            return result.get("text", "")
        return str(result) if result else ""

    def get_model_info(self) -> dict:
        return {
            "model_type": f"Whisper {self._model_size}",
            "loaded": self._pipeline is not None
        }


whisper_small_model = WhisperModel("small")
whisper_medium_model = WhisperModel("medium")
