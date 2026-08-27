import argparse
import json
from pathlib import Path
from typing import Any, Dict

from kits_client import KitsAIClient


def write_json(data: Dict[str, Any], output: str | None) -> None:
    rendered = json.dumps(data, indent=2, ensure_ascii=False)
    if output:
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered + "\n", encoding="utf-8")
        print(f"Saved: {path}")
    else:
        print(rendered)


def list_models(args: argparse.Namespace) -> None:
    client = KitsAIClient()
    response = client.list_voice_models(
        page=args.page,
        per_page=args.per_page,
        my_models=args.mine,
        order=args.order,
    )
    write_json(response, args.output)


def convert_audio(args: argparse.Namespace) -> None:
    client = KitsAIClient()
    job = client.create_voice_conversion(
        sound_file=args.input,
        voice_model_id=args.voice_model_id,
        conversion_strength=args.conversion_strength,
        model_volume_mix=args.model_volume_mix,
        pitch_shift=args.pitch_shift,
    )
    job_id = job.get("id")
    if not job_id:
        raise RuntimeError(f"Kits returned a job without an id: {job}")

    print(f"Kits job created: {job_id}")
    completed = client.wait_for_voice_conversion(
        int(job_id),
        poll_seconds=args.poll_seconds,
        timeout_seconds=args.timeout_seconds,
    )
    destination = client.download_conversion(completed, args.output)
    print(f"Downloaded: {destination}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Secure command-line bridge for the Kits.ai API"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    models = subparsers.add_parser("models", help="List available voice models")
    models.add_argument("--mine", action="store_true", help="Return only my models")
    models.add_argument("--page", type=int, default=1)
    models.add_argument("--per-page", type=int, default=50)
    models.add_argument("--order", choices=["asc", "desc"], default="asc")
    models.add_argument("--output", help="Optional JSON output path")
    models.set_defaults(handler=list_models)

    convert = subparsers.add_parser("convert", help="Convert an audio file")
    convert.add_argument("--input", required=True, help="Input WAV/MP3 path")
    convert.add_argument("--voice-model-id", type=int, required=True)
    convert.add_argument("--output", required=True, help="Output audio path")
    convert.add_argument("--conversion-strength", type=float)
    convert.add_argument("--model-volume-mix", type=float)
    convert.add_argument("--pitch-shift", type=int)
    convert.add_argument("--poll-seconds", type=int, default=5)
    convert.add_argument("--timeout-seconds", type=int, default=900)
    convert.set_defaults(handler=convert_audio)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
