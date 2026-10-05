import os
import torch
from transformers import AutoModel

MODEL_ID = "ai-sage/GigaAM-Multilingual"
MODEL_REVISION = "ctc"


def set_num_threads(num_threads: int = 1) -> None:
    torch.set_num_threads(num_threads)


class GigaAMMultilingualModel:
    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load_model(self):
        if self._model is None:
            print(f"Loading GigaAM Multilingual ({MODEL_REVISION})...")
            try:
                self._model = AutoModel.from_pretrained(
                    MODEL_ID,
                    revision=MODEL_REVISION,
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
                    MODEL_ID,
                    revision=MODEL_REVISION,
                    trust_remote_code=True,
                    torch_dtype=torch.float32,
                    device_map="cpu"
                )
                print("Model downloaded and loaded!")
        return self._model

    def transcribe(self, audio_path: str) -> str:
        if self._model is None:
            self.load_model()
        try:
            result = self._model.transcribe(audio_path)
            if isinstance(result, dict):
                return result.get("text", "")
            return str(result) if result else ""
        except Exception as e:
            raise

    def get_model_info(self) -> dict:
        return {
            "model_type": "GigaAM Multilingual",
            "revision": MODEL_REVISION,
            "loaded": self._model is not None
        }


gigaam_multilingual_model = GigaAMMultilingualModel()
