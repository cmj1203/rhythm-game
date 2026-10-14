# Source-signal warnings: flat-top clipping on the decoded channels and onset survival after a phone-speaker high-pass.
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Final

import librosa
import numpy as np
from scipy.signal import butter, find_peaks, sosfilt

from . import core
from .core import Context, Report, mc

CLIP_LEVEL: Final = 0.999
CLIP_MIN_RUN: Final = 3
# proposed, unvalidated
CLIP_RUNS_PER_MIN_MAX: Final = 10.0
PHONE_HIGHPASS_HZ: Final = 300
PHONE_DESCRIBE_HZ: Final = (200, 400)
HIGHPASS_ORDER: Final = 4
PEAK_STD_FACTOR: Final = 1.0
FLUX_FFT: Final = 2048
FLUX_COMPRESSION: Final = 100
FLUX_RMS: Final = 0.1
PEAK_TOLERANCE_FRAMES: Final = 2
PHONE_ANALYSIS_S: Final = 150
PHONE_SR: Final = 44100
PHONE_HOP: Final = 512
PHONE_TOLERANCE_S: Final = 0.03
# proposed, unvalidated; measured as the research scratch phone2.py kept300 (mono mix of the native channels at 44.1 kHz,
# linear flux, own peak height, 3 frames, first 150 s): 0.70 gives 1/129, 0.80 gives 11/129 there, 7 of 60 on public/songs
# (8bit-dungeon-boss, funkorama, loopster, occupy-the-dance-floor, sunday-dub, sunny-afternoon, video-games). The absolute-level
# survival below is a second condition for low-only material the relative measure cannot see.
PHONE_SURVIVAL_MIN: Final = 0.80

THRESHOLDS: Final[dict[str, float]] = {
    "clipping": CLIP_RUNS_PER_MIN_MAX,
    "phone_weak_beat": PHONE_SURVIVAL_MIN,
}


def clip_runs(channel: np.ndarray) -> int:
    """Runs of at least CLIP_MIN_RUN consecutive samples at |x| >= CLIP_LEVEL; isolated samples (even above 1.0) are ignored."""
    padded = np.concatenate([[0], (np.abs(channel) >= CLIP_LEVEL).astype(np.int8), [0]])
    edges = np.diff(padded)
    lengths = np.flatnonzero(edges == -1) - np.flatnonzero(edges == 1)
    return int(np.count_nonzero(lengths >= CLIP_MIN_RUN))


def clip_runs_per_minute(channels: np.ndarray, sample_rate: int) -> float:
    """Worst channel, on the decoded channels as they are: a downmix would add 3 dB and invent clipping."""
    minutes = channels.shape[1] / sample_rate / 60
    return max(clip_runs(channel) for channel in channels) / minutes


def onset_flux(samples: np.ndarray) -> np.ndarray:
    """Positive log-magnitude flux with the absolute level kept: librosa's dB onset strength renormalises to its own maximum and would blow a 58 dB-down residual back to full scale."""
    log_magnitude = np.log1p(FLUX_COMPRESSION * np.abs(librosa.stft(samples, n_fft=FLUX_FFT, hop_length=mc.HOP)))
    return np.maximum(log_magnitude[:, 1:] - log_magnitude[:, :-1], 0).sum(axis=0)


def peak_height(flux: np.ndarray) -> float:
    return float(np.mean(flux) + PEAK_STD_FACTOR * np.std(flux))


def local_peaks(envelope: np.ndarray) -> np.ndarray:
    height = peak_height(envelope)
    inner = envelope[1:-1]
    return np.flatnonzero((inner > envelope[:-2]) & (inner >= envelope[2:]) & (inner > height)) + 1


def relative_survivals(channels: np.ndarray, sample_rate: int, highpass_hz: tuple[int, ...]) -> dict[int, float | None]:
    """Each envelope keeps its own peak height, so a kick-only song survives this measure; absolute_survival covers that.
    Runs at 44.1 kHz on the native channels: the game's 22.05 kHz decode cuts everything above 11 kHz and moves the value by up to 0.067."""
    fft = FLUX_FFT
    tolerance = int(PHONE_TOLERANCE_S * PHONE_SR / PHONE_HOP) + 1
    clip = channels[:, : round(PHONE_ANALYSIS_S * sample_rate)].mean(axis=0)
    if sample_rate != PHONE_SR:
        clip = librosa.resample(clip, orig_sr=sample_rate, target_sr=PHONE_SR)
    frame_count = (len(clip) - fft) // PHONE_HOP
    if frame_count < 3:
        return dict.fromkeys(highpass_hz)
    frames = np.lib.stride_tricks.sliding_window_view(clip, fft)[: frame_count * PHONE_HOP : PHONE_HOP]
    magnitude = np.abs(np.fft.rfft(frames * np.hanning(fft), axis=1))
    frequency = np.fft.rfftfreq(fft, 1 / PHONE_SR)

    def flux(weight: np.ndarray) -> np.ndarray:
        weighted = magnitude * weight[None, :]
        return np.maximum(weighted[1:] - weighted[:-1], 0).sum(axis=1)

    full_peaks = local_peaks(flux(np.ones_like(frequency)))
    survivals: dict[int, float | None] = {}
    for hertz in highpass_hz:
        if len(full_peaks) == 0:
            survivals[hertz] = None
            continue
        kept = local_peaks(flux(1 / np.sqrt(1 + (hertz / np.maximum(frequency, 1e-3)) ** (2 * HIGHPASS_ORDER))))
        survivals[hertz] = (
            float(np.mean(np.min(np.abs(full_peaks[:, None] - kept[None, :]), axis=1) <= tolerance))
            if len(kept)
            else 0.0
        )
    return survivals


def absolute_survival(samples: np.ndarray, highpass_hz: float) -> float | None:
    """Share of the full-band onset peaks that keep a peak within +-2 frames after the high-pass, judged at the full-band height; None without peaks."""
    level = samples / (float(np.sqrt(np.mean(samples**2))) + 1e-9) * FLUX_RMS
    full = onset_flux(level)
    height = peak_height(full)
    full_peaks, _ = find_peaks(full, height=height)
    if len(full_peaks) == 0:
        return None
    sos = butter(HIGHPASS_ORDER, highpass_hz, btype="highpass", fs=mc.SAMPLE_RATE, output="sos")
    kept, _ = find_peaks(onset_flux(sosfilt(sos, level).astype(np.float32)), height=height)
    if len(kept) == 0:
        return 0.0
    nearest = np.min(np.abs(full_peaks[:, None] - kept[None, :]), axis=1)
    return float(np.mean(nearest <= PEAK_TOLERANCE_FRAMES))


def check_clipping(ctx: Context, report: Report) -> None:
    runs = clip_runs_per_minute(ctx.channels, ctx.native_sr)
    report.describe["clip_runs_per_min"] = core.rounded(runs)
    if runs > CLIP_RUNS_PER_MIN_MAX:
        report.add("flag", "clipping", "소리가 깎여 있음", runs, CLIP_RUNS_PER_MIN_MAX, "분당 연속 3샘플 이상 꼭대기가 평평한 횟수")


def check_phone_band(ctx: Context, report: Report) -> None:
    relative = relative_survivals(ctx.channels, ctx.native_sr, (*PHONE_DESCRIBE_HZ, PHONE_HIGHPASS_HZ))
    for hertz, value in relative.items():
        report.describe[f"phone_survival_{hertz}"] = core.rounded(value)
    absolute = absolute_survival(ctx.samples, PHONE_HIGHPASS_HZ)
    report.describe[f"phone_survival_abs_{PHONE_HIGHPASS_HZ}"] = core.rounded(absolute)
    measured = [value for value in (relative[PHONE_HIGHPASS_HZ], absolute) if value is not None]
    if measured and min(measured) < PHONE_SURVIVAL_MIN:
        report.add(
            "flag",
            "phone_weak_beat",
            "폰 스피커에서 박이 약함",
            min(measured),
            PHONE_SURVIVAL_MIN,
            "300Hz 위만 남겼을 때 남는 박의 비율(상대·절대 중 낮은 값). 대용 지표라 귀로 확인해야 함",
        )


CHECKS: Final[list[core.Check]] = [check_clipping, check_phone_band]


def synthetic_context(signal: np.ndarray) -> Context:
    mono = signal.astype(np.float32)
    return Context(Path("synthetic.wav"), {}, mono, mono[None, :], mc.SAMPLE_RATE, mono, np.zeros(1), None)


def flagged(signal: np.ndarray) -> tuple[list[str], dict[str, object]]:
    report = Report()
    for check in CHECKS:
        check(synthetic_context(signal), report)
    return report.codes("flag"), report.describe


def kick_only(bpm: float, seconds: float) -> np.ndarray:
    signal = np.zeros(round(seconds * mc.SAMPLE_RATE), dtype=np.float32)
    length = round(0.4 * mc.SAMPLE_RATE)
    t = np.arange(length) / mc.SAMPLE_RATE
    hit = (1 - np.exp(-t / 0.008)) * np.exp(-t * 9) * np.sin(2 * np.pi * 55 * t)
    for start in np.arange(0, seconds - 0.4, 60 / bpm):
        begin = round(start * mc.SAMPLE_RATE)
        signal[begin : begin + length] += hit
    return signal / np.max(np.abs(signal)) * 0.5


def test_clipped_sine_flags_clipping() -> None:
    t = np.arange(10 * mc.SAMPLE_RATE) / mc.SAMPLE_RATE
    clipped = np.clip(4 * 0.5 * np.sin(2 * np.pi * 220 * t), -1.0, 1.0)
    codes, describe = flagged(clipped)
    assert "clipping" in codes, (codes, describe)


def test_clip_counter_on_mono_and_stereo() -> None:
    t = np.arange(10 * mc.SAMPLE_RATE) / mc.SAMPLE_RATE
    clipped = np.clip(2.0 * np.sin(2 * np.pi * 220 * t), -1.0, 1.0)
    mono = clipped[None, :]
    stereo = np.stack([0.3 * clipped, clipped])
    assert clip_runs_per_minute(mono, mc.SAMPLE_RATE) > CLIP_RUNS_PER_MIN_MAX
    assert clip_runs_per_minute(stereo, mc.SAMPLE_RATE) > CLIP_RUNS_PER_MIN_MAX, "one clipped channel must count"
    isolated = np.zeros((2, 10 * mc.SAMPLE_RATE))
    isolated[:, ::1000] = 1.2
    isolated[:, 5:7] = 1.0
    assert clip_runs_per_minute(isolated, mc.SAMPLE_RATE) == 0, "isolated and 2-sample peaks are not clipping"


def test_kick_only_flags_phone_weak_beat() -> None:
    codes, describe = flagged(kick_only(120, 20))
    assert "phone_weak_beat" in codes and "clipping" not in codes, (codes, describe)


def test_clean_click_has_no_flags() -> None:
    codes, describe = flagged(core.synthetic_click(120, 20))
    assert codes == [], (codes, describe)


SELF_TESTS: Final[list[Callable[[], None]]] = [
    test_clipped_sine_flags_clipping,
    test_clip_counter_on_mono_and_stereo,
    test_kick_only_flags_phone_weak_beat,
    test_clean_click_has_no_flags,
]
