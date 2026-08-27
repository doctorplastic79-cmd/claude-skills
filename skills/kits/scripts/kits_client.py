import mimetypes
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests


class KitsAIClient:
    """Small, dependency-light client for the Kits.ai REST API."""

    BASE_URL = "https://arpeggi.io/api/kits/v1"

    def __init__(self, api_key: Optional[str] = None, timeout: int = 60):
        self.api_key = api_key or os.getenv("KITS_API_KEY")
        if not self.api_key:
            raise RuntimeError(
                "KITS_API_KEY is not configured. Set it as an environment variable "
                "or GitHub Actions secret."
            )

        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.api_key}",
                "Accept": "application/json",
            }
        )

    @staticmethod
    def _validate_unit_interval(name: str, value: Optional[float]) -> None:
        if value is not None and not 0 <= value <= 1:
            raise ValueError(f"{name} must be between 0 and 1")

    @staticmethod
    def _raise(response: requests.Response) -> None:
        try:
            detail: Any = response.json()
        except ValueError:
            detail = response.text
        raise RuntimeError(f"Kits API error {response.status_code}: {detail}")

    def list_voice_models(
        self,
        page: int = 1,
        per_page: int = 50,
        *,
        my_models: bool = False,
        order: str = "asc",
    ) -> Dict[str, Any]:
        if page < 1:
            raise ValueError("page must be at least 1")
        if per_page < 1:
            raise ValueError("per_page must be at least 1")
        if order not in {"asc", "desc"}:
            raise ValueError("order must be 'asc' or 'desc'")

        params: Dict[str, Any] = {
            "page": page,
            "perPage": per_page,
            "order": order,
        }
        if my_models:
            params["myModels"] = "true"

        response = self.session.get(
            f"{self.BASE_URL}/voice-models",
            params=params,
            timeout=self.timeout,
        )
        if not response.ok:
            self._raise(response)
        return response.json()

    def get_voice_model(self, model_id: int) -> Dict[str, Any]:
        response = self.session.get(
            f"{self.BASE_URL}/voice-models/{model_id}", timeout=self.timeout
        )
        if not response.ok:
            self._raise(response)
        return response.json()

    def create_voice_conversion(
        self,
        sound_file: str,
        voice_model_id: int,
        conversion_strength: Optional[float] = None,
        model_volume_mix: Optional[float] = None,
        pitch_shift: Optional[int] = None,
    ) -> Dict[str, Any]:
        path = Path(sound_file)
        if not path.is_file():
            raise FileNotFoundError(path)
        if voice_model_id < 1:
            raise ValueError("voice_model_id must be a positive integer")

        self._validate_unit_interval("conversion_strength", conversion_strength)
        self._validate_unit_interval("model_volume_mix", model_volume_mix)
        if pitch_shift is not None and not -24 <= pitch_shift <= 24:
            raise ValueError("pitch_shift must be between -24 and 24 semitones")

        data: Dict[str, str] = {"voiceModelId": str(voice_model_id)}
        if conversion_strength is not None:
            data["conversionStrength"] = str(conversion_strength)
        if model_volume_mix is not None:
            data["modelVolumeMix"] = str(model_volume_mix)
        if pitch_shift is not None:
            data["pitchShift"] = str(pitch_shift)

        media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        with path.open("rb") as file_handle:
            response = self.session.post(
                f"{self.BASE_URL}/voice-conversions",
                data=data,
                files={"soundFile": (path.name, file_handle, media_type)},
                timeout=max(self.timeout, 180),
            )

        if not response.ok:
            self._raise(response)
        return response.json()

    def get_voice_conversion(self, job_id: int) -> Dict[str, Any]:
        response = self.session.get(
            f"{self.BASE_URL}/voice-conversions/{job_id}", timeout=self.timeout
        )
        if not response.ok:
            self._raise(response)
        return response.json()

    def wait_for_voice_conversion(
        self,
        job_id: int,
        poll_seconds: int = 5,
        timeout_seconds: int = 900,
    ) -> Dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            job = self.get_voice_conversion(job_id)
            status = job.get("status")
            if status == "success":
                return job
            if status in {"error", "cancelled"}:
                raise RuntimeError(
                    f"Kits conversion ended with status={status}: {job}"
                )
            time.sleep(poll_seconds)

        raise TimeoutError(f"Kits conversion {job_id} did not finish in time")

    def download_conversion(self, job: Dict[str, Any], destination: str) -> str:
        url = job.get("outputFileUrl") or job.get("lossyOutputFileUrl")
        if not url:
            raise RuntimeError("Conversion job has no output URL")

        response = requests.get(url, timeout=max(self.timeout, 180))
        response.raise_for_status()

        output_path = Path(destination)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(response.content)
        return str(output_path)
