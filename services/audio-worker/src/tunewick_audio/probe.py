"""Container/codec probing and the upload allow-list (docs/audio.md §2.1–§2.2)."""

from __future__ import annotations

from dataclasses import dataclass, field

from .ffmpeg import FfmpegError, ffprobe

SAMPLE_RATES = (44100, 48000, 88200, 96000, 176400, 192000)
MIN_DURATION_S = 10.0
MAX_DURATION_S = 4 * 3600.0

# ffmpeg demuxer names of the accepted containers (BWF and RF64 are read by the wav demuxer,
# ALAC lives in an MP4/M4A container).
CONTAINERS = {"wav": "wav", "aiff": "aiff", "flac": "flac", "mov": "m4a"}

# codec → (declared bits, sample format)
PCM_CODECS = {
    "pcm_s16le": (16, "int"),
    "pcm_s16be": (16, "int"),
    "pcm_s24le": (24, "int"),
    "pcm_s24be": (24, "int"),
    "pcm_s32le": (32, "int"),
    "pcm_s32be": (32, "int"),
    "pcm_f32le": (32, "float"),
    "pcm_f32be": (32, "float"),
    "pcm_f64le": (64, "float"),
    "pcm_f64be": (64, "float"),
}
LOSSLESS_CODECS = ("flac", "alac")
MAX_TAG_LENGTH = 500


class Rejected(Exception):
    """The upload cannot be accepted; `code` is stable, `message` is shown to the artist."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Probe:
    container: str
    codec: str
    sample_rate: int
    channels: int
    bits: int
    sample_format: str  # "int" | "float"
    duration_s: float | None
    tags: dict[str, str] = field(default_factory=dict)


def _bits_from_stream(stream: dict) -> int:
    raw = int(stream.get("bits_per_raw_sample") or 0)
    if raw:
        return raw
    fmt = stream.get("sample_fmt", "")
    return 16 if fmt.startswith("s16") else 24 if fmt.startswith("s32") else 0


def probe(path: str) -> Probe:
    try:
        info = ffprobe(path)
    except FfmpegError as error:
        raise Rejected("unreadable", "The file could not be read as audio.") from error

    fmt = info.get("format", {})
    container = next(
        (CONTAINERS[name] for name in fmt.get("format_name", "").split(",") if name in CONTAINERS),
        None,
    )
    if container is None:
        raise Rejected(
            "unsupported_container",
            "Only WAV/BWF, AIFF, FLAC and ALAC (.m4a) masters are accepted.",
        )

    audio = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    if len(audio) != 1:
        raise Rejected("audio_streams", "The file must contain exactly one audio stream.")
    stream = audio[0]
    codec = stream.get("codec_name", "")

    if codec in PCM_CODECS:
        bits, sample_format = PCM_CODECS[codec]
    elif codec in LOSSLESS_CODECS:
        bits, sample_format = _bits_from_stream(stream), "int"
    else:
        raise Rejected(
            "unsupported_codec",
            f"Only lossless masters are accepted; this file contains {codec or 'unknown'} audio. "
            "Upload the original WAV, AIFF, FLAC or ALAC master.",
        )
    if sample_format == "int" and not 16 <= bits <= 32:
        raise Rejected("bit_depth", "Bit depth must be 16, 24 or 32 bits.")

    sample_rate = int(stream.get("sample_rate") or 0)
    if sample_rate not in SAMPLE_RATES:
        raise Rejected(
            "sample_rate",
            f"Sample rate {sample_rate} Hz is not supported (44.1–192 kHz, standard rates only).",
        )
    channels = int(stream.get("channels") or 0)
    if channels not in (1, 2):
        raise Rejected("channels", "Only mono and stereo masters are accepted for now.")

    duration = fmt.get("duration") or stream.get("duration")
    duration_s = float(duration) if duration not in (None, "N/A") else None
    if duration_s is not None and duration_s > MAX_DURATION_S + 60:
        raise Rejected("duration", "Tracks longer than 4 hours are not accepted.")

    tags: dict[str, str] = {}
    for source in (fmt.get("tags") or {}, stream.get("tags") or {}):
        for key, value in source.items():
            tags.setdefault(key.lower(), str(value)[:MAX_TAG_LENGTH])

    return Probe(
        container=container,
        codec=codec,
        sample_rate=sample_rate,
        channels=channels,
        bits=bits,
        sample_format=sample_format,
        duration_s=duration_s,
        tags=tags,
    )


def read_flac_md5(path: str) -> str | None:
    """MD5 stored in the FLAC STREAMINFO block, or None when absent/unset (all zeros)."""
    with open(path, "rb") as handle:
        head = handle.read(4)
        if head[:3] == b"ID3":
            header = head + handle.read(6)
            size = 0
            for byte in header[6:10]:
                size = (size << 7) | (byte & 0x7F)
            handle.seek(10 + size)
            head = handle.read(4)
        if head != b"fLaC":
            return None
        block_header = handle.read(4)
        if len(block_header) < 4 or block_header[0] & 0x7F != 0:  # STREAMINFO must come first
            return None
        streaminfo = handle.read(34)
    md5 = streaminfo[18:34]
    return None if len(md5) < 16 or not any(md5) else md5.hex()
