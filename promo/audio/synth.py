#!/usr/bin/env python3
"""
KRONOS promo soundtrack: original music + sound design, synthesized from
scratch and locked to the video's cue sheet (../timeline.json).

    python audio/synth.py        ->  public/audio/soundtrack.wav

120 BPM, A minor resolving to C major. Nothing is sampled: every drum,
synth, riser, whoosh and UI click is generated here, so the track is
royalty-free and each hit lands exactly on its video frame.

Requires: numpy, scipy, numba, soundfile, pyloudnorm
"""
import json
import os

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from numba import njit
from scipy.signal import butter, fftconvolve, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TL = json.load(open(os.path.join(ROOT, 'timeline.json')))

SR = 48000
DUR = TL['duration']
N = int(round(DUR * SR))
BEAT = 60.0 / TL['bpm']
BAR = 4 * BEAT
S16 = BEAT / 4
rng = np.random.default_rng(20260930)

# --------------------------------------------------------------------------
# DSP building blocks
# --------------------------------------------------------------------------

NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def hz(name):
    """'A3' -> 220.0"""
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[pitch] + 12 * (octave + 1) - 69) / 12)


def tvec(n):
    return np.arange(n) / SR


def sos(kind, f, order=2):
    return butter(order, f, kind, fs=SR, output='sos')


def filt(x, kind, f, order=2):
    return sosfilt(sos(kind, f, order), x, axis=-1)


def shelf(x, f0, gain_db, kind='high', slope=0.8):
    """RBJ-cookbook shelving EQ (one biquad)."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / 2 * np.sqrt((A + 1 / A) * (1 / slope - 1) + 2)
    c = np.cos(w0)
    sq = 2 * np.sqrt(A) * alpha
    if kind == 'high':
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    else:
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    return sosfilt(np.array([[*(np.array(b) / a[0]), 1.0, a[1] / a[0], a[2] / a[0]]]), x, axis=-1)


@njit(cache=True)
def _svf(x, cutoff, q, mode, sr):
    # Topology-preserving-transform state-variable filter (Zavalishin).
    n = x.shape[0]
    y = np.zeros(n)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(n):
        fc = cutoff[i]
        if fc > 0.45 * sr:
            fc = 0.45 * sr
        g = np.tan(np.pi * fc / sr)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = v1
        else:
            y[i] = x[i] - k * v1 - v2
    return y


def svf(x, cutoff, q=0.7, mode='lp'):
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape).copy()
    return _svf(x.astype(np.float64), cutoff, float(q), {'lp': 0, 'bp': 1, 'hp': 2}[mode], float(SR))


def saw(freq, n, phase0=None):
    """Band-limited (polyBLEP) sawtooth; freq may be a scalar or an array."""
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    dt = f / SR
    ph = ((rng.random() if phase0 is None else phase0) + np.cumsum(dt)) % 1.0
    y = 2.0 * ph - 1.0
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1.0
    m = ph > 1.0 - dt
    x = (ph[m] - 1.0) / dt[m]
    y[m] -= x * x + x + x + 1.0
    return y


def sine(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    return np.sin(2 * np.pi * (phase0 + np.cumsum(f) / SR))


def noise(n):
    return rng.standard_normal(n)


def fade(n, a=0.002, r=0.01):
    t = tvec(n)
    dur = n / SR
    return np.clip(t / max(a, 1e-6), 0, 1) * np.clip((dur - t) / max(r, 1e-6), 0, 1)


def delayed(y, samples):
    """Delay a mono signal by `samples`, zero-filled (no wrap-around)."""
    return np.concatenate([np.zeros(samples), y[: y.size - samples]])


def pan2(x, pan):
    """Constant-power pan of a mono signal; pan may be an array (moving)."""
    p = (np.asarray(pan) + 1) * np.pi / 4
    return np.vstack([x * np.cos(p), x * np.sin(p)]) * np.sqrt(2)


class Bus:
    def __init__(self):
        self.x = np.zeros((2, N))

    def add(self, sig, t, gain=1.0, pan=0.0):
        if sig.ndim == 1:
            sig = pan2(sig, pan)
        i0 = int(round(t * SR))
        a, b = max(0, i0), min(N, i0 + sig.shape[1])
        if b > a:
            self.x[:, a:b] += gain * sig[:, a - i0:b - i0]


def reverb_ir(rt60=1.8, length=2.6, predelay=0.014, damp=6500, seed=3):
    g = np.random.default_rng(seed)
    n = int(length * SR)
    t = tvec(n)
    env = np.exp(-6.9 * t / rt60)
    ir = np.vstack([g.standard_normal(n) * env, g.standard_normal(n) * env])
    ir = filt(ir, 'lp', damp, 2)
    ir = filt(ir, 'hp', 180, 1)
    ir = np.pad(ir, ((0, 0), (int(predelay * SR), 0)))[:, :n]
    for d, a in ((0.011, 0.5), (0.019, 0.35), (0.027, 0.25)):  # early reflections
        i = int(d * SR)
        ir[0, i] += a
        ir[1, i + 37] += a
    return ir / np.sqrt((ir ** 2).sum() / 2)


def reverb(x, ir):
    return np.vstack([fftconvolve(x[0], ir[0])[:N], fftconvolve(x[1], ir[1])[:N]])


def pingpong(x, time, fb=0.38, reps=6):
    out = np.zeros_like(x)
    d = int(time * SR)
    for k in range(1, reps + 1):
        g = fb ** k
        src = x[0] + x[1]
        ch = k % 2
        out[ch, k * d:] += 0.5 * g * src[: N - k * d]
    return filt(out, 'lp', 5000, 1)


@njit(cache=True)
def _envelope_follow(x, att, rel):
    y = np.zeros_like(x)
    e = 0.0
    for i in range(x.shape[0]):
        v = x[i]
        c = att if v > e else rel
        e = c * e + (1 - c) * v
        y[i] = e
    return y


def compress(x, thresh_db=-16, ratio=2.5, att=0.008, rel=0.15, makeup_db=0.0):
    lvl = np.sqrt(_envelope_follow((x ** 2).mean(axis=0), np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))) + 1e-12)
    db = 20 * np.log10(lvl)
    over = np.maximum(0, db - thresh_db)
    gain_db = -over * (1 - 1 / ratio) + makeup_db
    return x * 10 ** (gain_db / 20)


def limiter(x, ceiling_db=-1.0, look=0.004, rel=0.06):
    ceil = 10 ** (ceiling_db / 20)
    peak = np.abs(x).max(axis=0)
    need = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
    la = int(look * SR)
    # look-ahead: minimum over the window, then smooth release
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * la + 1)
    g = np.concatenate([g[la:], np.ones(la)])
    sm = _envelope_follow(1 - g, np.exp(-1 / (0.0008 * SR)), np.exp(-1 / (rel * SR)))
    g = np.minimum(g, 1 - sm)
    return x * g


# --------------------------------------------------------------------------
# Instruments
# --------------------------------------------------------------------------


def kick(length=0.45, f0=160, f1=48, ptau=0.028, atau=0.2, click=0.3, drive=1.8):
    n = int(length * SR)
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / ptau)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / atau) * np.clip(t / 0.0012, 0, 1)
    snap = filt(noise(n) * np.exp(-t / 0.0035), 'hp', 2200)
    y = np.tanh((body + click * snap) * drive) / np.tanh(drive)
    return y * fade(n, 0.0005, 0.02)


def clap(length=0.45):
    n = int(length * SR)
    t = tvec(n)
    env = np.zeros(n)
    for d, a in ((0.0, 0.8), (0.010, 0.75), (0.021, 1.0)):
        i = int(d * SR)
        env[i:] += a * np.exp(-(t[i:] - d) / 0.0055)
    env += 0.5 * np.exp(-np.maximum(0, t - 0.024) / 0.12) * (t > 0.024)
    y = filt(noise(n) * env, 'bp', [950, 3200], 2)
    return 1.9 * y * fade(n, 0.0005, 0.03)


def snare(length=0.28, tone=190):
    n = int(length * SR)
    t = tvec(n)
    body = np.sin(2 * np.pi * tone * t) * np.exp(-t / 0.045) + 0.5 * np.sin(2 * np.pi * tone * 1.72 * t) * np.exp(-t / 0.03)
    nz = filt(noise(n), 'bp', [1600, 8000], 2) * np.exp(-t / 0.09)
    return (0.55 * body + 1.2 * nz) * fade(n, 0.0005, 0.02)


def hat(length=0.07, tau=0.02, hp=7200):
    n = int(length * SR)
    t = tvec(n)
    # 808-style metal: detuned square partials + noise, band-limited high
    metal = sum(np.sign(np.sin(2 * np.pi * f * t + rng.random() * 6.28)) for f in (3140, 4410, 5330, 6200, 7420))
    y = filt(0.35 * metal / 5 + noise(n), 'hp', hp, 2)
    return y * np.exp(-t / tau) * fade(n, 0.0004, 0.01)


def ride(length=0.6):
    n = int(length * SR)
    t = tvec(n)
    metal = sum(np.sin(2 * np.pi * f * t) for f in (3710, 5140, 6680, 8350))
    y = filt(0.25 * metal + noise(n) * 0.6, 'hp', 4500)
    return y * (0.35 * np.exp(-t / 0.02) + 0.25 * np.exp(-t / 0.35))


def tick(length=0.012, f=3600, tau=0.0018):
    n = int(length * SR)
    t = tvec(n)
    y = filt(noise(n), 'bp', [f * 0.7, f * 1.4], 2) * np.exp(-t / tau)
    return y + 0.4 * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t / (tau * 0.8))


def clock_tick(high=True):
    """Wood-and-metal clock tick (a nod to Chronos, the god of time)."""
    n = int(0.06 * SR)
    t = tvec(n)
    f = 2350 if high else 1780
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) + 0.6 * np.sin(2 * np.pi * f * 2.31 * t) * np.exp(-t / 0.003)
    y += 0.5 * filt(noise(n), 'bp', [f * 0.8, f * 1.8], 2) * np.exp(-t / 0.002)
    return y


def ui_click(f=3000):
    n = int(0.03 * SR)
    t = tvec(n)
    imp = np.zeros(n)
    imp[0] = 1.0
    ring = svf(imp * 40, f, 7, 'bp')
    body = np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.004)
    return (ring * np.exp(-t / 0.006) + 0.5 * body) * fade(n, 0.0002, 0.005)


def blip(f, length=0.035):
    n = int(length * SR)
    t = tvec(n)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 3 * f * t)
    return y * fade(n, 0.002, 0.012) * np.exp(-t / 0.03)


def pop(f=880, length=0.16):
    n = int(length * SR)
    t = tvec(n)
    fr = f * (1 + 0.9 * np.exp(-t / 0.012))
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / 0.05)
    c = ui_click(min(f * 3, 9000))
    y[: c.size] += 0.3 * c[: n]
    return y * fade(n, 0.001, 0.02)


def bell(f, length=1.6):
    n = int(length * SR)
    t = tvec(n)
    y = np.zeros(n)
    for r, a, tau in ((1.0, 1.0, 0.9), (2.0, 0.35, 0.5), (2.76, 0.5, 0.35), (5.4, 0.25, 0.18), (8.93, 0.12, 0.09)):
        y += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / tau)
    return y * fade(n, 0.001, 0.05)


def glitch(length=0.14):
    n = int(length * SR)
    y = np.zeros(n)
    i = 0
    while i < n:
        seg = int(rng.uniform(0.004, 0.02) * SR)
        hold = int(rng.uniform(8, 60))
        src = np.repeat(rng.uniform(-1, 1, seg // hold + 1), hold)[:seg]
        y[i:i + seg] = src[: max(0, min(seg, n - i))] * rng.uniform(0.3, 1)
        i += seg
    y = np.round(y * 6) / 6  # bit-crush
    return filt(y, 'bp', [500, 7000], 1) * fade(n, 0.001, 0.02)


def whoosh(length=0.45, lo=350, hi=3800, peak=0.55, pan_from=-0.7, pan_to=0.7, q=1.3):
    n = int(length * SR)
    t = tvec(n)
    p = t / length
    amp = np.where(p < peak, (p / peak) ** 2.2, ((1 - p) / (1 - peak)) ** 1.6)
    fc = lo + (hi - lo) * np.sin(np.pi * np.clip(p * 0.5 / peak, 0, 1) * 0.999) ** 1.3
    y = svf(noise(n), fc, q, 'bp') * amp
    y += 0.35 * svf(noise(n), fc * 2.2, q * 1.5, 'bp') * amp
    return pan2(y, np.linspace(pan_from, pan_to, n))


def riser(length, lo=250, hi=7500, tone_from='A2', tone_to='A4', curve=2.0):
    n = int(length * SR)
    t = tvec(n)
    p = t / length
    fc = lo * (hi / lo) ** (p ** 1.3)
    nz = svf(noise(n), fc, 2.2, 'bp')
    f = hz(tone_from) * (hz(tone_to) / hz(tone_from)) ** (p ** 1.4)
    tone = svf(saw(f, n) + saw(f * 1.01, n), fc * 0.8, 0.9, 'lp') * 0.35
    amp = p ** curve
    y = (nz + tone) * amp
    return np.vstack([y, delayed(y, int(0.004 * SR))])


def reverse_crash(length=0.7):
    n = int(length * SR)
    t = tvec(n)
    c = filt(noise(n), 'hp', 3200) * np.exp(-t / 0.4)
    c = filt(c, 'lp', 11000)
    y = c[::-1] * np.clip(t / length, 0, 1) ** 0.5
    return np.vstack([y, delayed(y, 91)])


def boom(length=2.6, depth=1.0):
    n = int(length * SR)
    t = tvec(n)
    f = 38 + 50 * np.exp(-t / 0.2)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)
    thump = kick(0.4, 120, 40, 0.03, 0.18, 0.4, 2.2)
    sub[: thump.size] += 0.8 * thump
    crash = filt(filt(noise(n), 'hp', 1800), 'lp', 7500) * (np.exp(-t / 1.0) * 0.5 + np.exp(-t / 0.08) * 0.8)
    crash_r = filt(filt(noise(n), 'hp', 1800), 'lp', 7500) * (np.exp(-t / 1.0) * 0.5 + np.exp(-t / 0.08) * 0.8)
    return np.vstack([depth * sub + 0.24 * crash, depth * sub + 0.24 * crash_r]) * fade(n, 0.0005, 0.3)


def supersaw(freqs, length, attack=0.06, release=0.6, cutoff=2600, voices=5, detune=0.14, decay=None, bright=None):
    """Stereo supersaw chord. `decay` turns it into a stab; `bright` adds a filter envelope."""
    n = int((length + release) * SR)
    t = tvec(n)
    L = np.zeros(n)
    R = np.zeros(n)
    for f in freqs:
        for v in range(voices):
            x = (v - (voices - 1) / 2) / ((voices - 1) / 2)
            s = saw(f * 2 ** (x * detune / 12), n)
            p = (x * 0.85 + 1) * np.pi / 4
            L += s * np.cos(p)
            R += s * np.sin(p)
    env = np.clip(t / attack, 0, 1) * np.clip((length + release - t) / release, 0, 1)
    if decay:
        env *= np.exp(-t / decay)
    cut = cutoff if bright is None else cutoff + (bright - cutoff) * np.exp(-t / 0.18)
    L = svf(L, cut, 0.8, 'lp') * env
    R = svf(R, cut, 0.8, 'lp') * env
    return np.vstack([L, R]) / (len(freqs) * voices) ** 0.5 * 0.9


def pluck(f, length=0.24, bright=4800, dark=650, decay=0.075):
    n = int(length * SR)
    t = tvec(n)
    s = 0.6 * saw(f, n) + 0.4 * saw(f * 1.007, n) + 0.3 * np.sign(sine(f / 2, n))
    cut = dark + (bright - dark) * np.exp(-t / decay)
    return svf(s, cut, 1.15, 'lp') * np.exp(-t / 0.17) * fade(n, 0.001, 0.03)


def bass_note(f, length):
    n = int(length * SR)
    t = tvec(n)
    s = 0.55 * saw(f, n) + 0.45 * saw(f * 1.003, n)
    cut = 170 + 1500 * np.exp(-t / 0.09)
    y = svf(s, cut, 1.0, 'lp')
    y = np.tanh(y * 1.8) * 0.75 + 0.4 * np.sin(2 * np.pi * (f / 2) * t)  # growl + sub octave
    return y * fade(n, 0.002, 0.025)


def sidechain(times, depth=0.65, rel=0.16):
    env = np.ones(N)
    n = int(0.35 * SR)
    t = tvec(n)
    shape = 1 - depth * np.exp(-((t / rel) ** 2) * 2.5)
    for kt in times:
        i = int(round(kt * SR))
        a, b = max(0, i), min(N, i + n)
        if b > a:
            env[a:b] = np.minimum(env[a:b], shape[a - i:b - i])
    return env


# --------------------------------------------------------------------------
# Arrangement
# --------------------------------------------------------------------------

drums, bass, pads, arp, sfx, ambience = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()
impacts = Bus()  # the big hits: they bypass the pre-hit duck
send_short = Bus()  # tight room for drums / UI
send_long = Bus()  # big hall for pads, impacts

hook = TL['hook']['words']
land = TL['logo']['land']
portal, portal_end = TL['logo']['portal'], TL['logo']['portalEnd']
drop = TL['f1']['drop']
roll3, roll4 = TL['f3']['roll'], TL['f4']['roll']
mont = TL['montage']['start']
end = TL['end']['start']

# ---- 0 → 2 s · hook: four slot-machine hits climbing A C D E ------------
for i, (w, note) in enumerate(zip(hook, ['A3', 'C4', 'D4', 'E4'])):
    # reel spin: decelerating ticks sweeping left → right with the letter cascade
    ticks = np.cumsum(np.linspace(0.010, 0.026, 7))
    for k, dt in enumerate(ticks):
        sfx.add(tick(f=3200 + 300 * (k % 3)), w - 0.125 + dt, 0.22, pan=-0.6 + 1.2 * k / 6)
    drums.add(kick(0.45, 140, 46, 0.025, 0.22, 0.35), w, 0.95)
    drums.add(clap(), w, 0.28 + 0.06 * i)
    arp.add(pluck(hz(note), 0.5, 7000, 900, 0.12), w, 0.55)
    arp.add(pluck(hz(note) * 2, 0.4, 8000, 1400, 0.08), w + 0.003, 0.22)
    send_long.add(pluck(hz(note), 0.5), w, 0.35)

# the clock (Kronos ≈ Chronos): tick-tock 8ths under the hook and the logo
for k in range(int(3.5 / (BEAT / 2))):
    tt = k * BEAT / 2
    sfx.add(clock_tick(k % 2 == 0), tt, 0.10 if tt < land else 0.07, pan=-0.25 if k % 2 == 0 else 0.25)

# low drone swelling into the logo
n = int(land * SR)
dr = svf(saw(hz('A1'), n) + saw(hz('A2') * 1.004, n) + 0.5 * sine(hz('A1'), n), np.linspace(150, 1100, n), 1.1, 'lp')
ambience.add(np.vstack([dr, dr]) * np.linspace(0, 1, n) ** 1.5, 0, 0.22)
sfx.add(riser(1.8, 300, 8000, 'A2', 'A4', 2.3), 0.2, 0.28)
sfx.add(reverse_crash(0.8), land - 0.8, 0.5)

# ---- 2 s · KRONOS lands ------------------------------------------------------
for k, dt in enumerate(np.cumsum(np.linspace(0.010, 0.026, 7))):
    sfx.add(tick(f=3400), land - 0.125 + dt, 0.22, pan=-0.6 + 1.2 * k / 6)
impacts.add(boom(2.8, 1.0), land, 0.95)
stab = supersaw([hz('A3'), hz('C4'), hz('E4'), hz('B4')], 0.25, 0.004, 1.4, 1800, 7, 0.18, decay=0.7, bright=7000)
impacts.add(stab, land, 0.8)
send_long.add(stab, land, 0.9)
bass.add(bass_note(hz('A2'), 1.2), land, 0.9)
pads.add(supersaw([hz('A2'), hz('E3'), hz('G3'), hz('C4'), hz('B3')], portal - land + 0.2, 0.35, 0.5, 1300, 5, 0.12), land, 0.55)
# GLOBAL TERMINAL decodes: a spray of data blips
for k in range(14):
    sfx.add(blip(rng.uniform(1800, 4200)), TL['logo']['subtitle'] + k * 0.026 + rng.uniform(0, 0.01), 0.07, pan=rng.uniform(-0.6, 0.6))
# arp creeping in under the logo (filter opening)
am9 = ['A3', 'C4', 'E4', 'G4', 'B4', 'E4', 'C4', 'G3']
for k in range(int((drop - 2.5) / S16)):
    tt = 2.5 + k * S16
    p = k / ((drop - 2.5) / S16)
    arp.add(pluck(hz(am9[k % 8]), 0.2, 1200 + 5000 * p ** 2, 500, 0.06), tt, 0.28 + 0.2 * p, pan=0.35 * np.sin(k * 1.3))

# ---- 3.2 → 3.55 s · through the O -------------------------------------------
sfx.add(riser(portal_end - portal + 0.25, 500, 9000, 'E3', 'E5', 1.6), portal - 0.25, 0.42)
sfx.add(whoosh(0.55, 300, 5200, 0.7, -0.2, 0.2, 1.1), portal - 0.1, 0.9)
impacts.add(boom(1.4, 0.55), portal_end, 0.55)
sfx.add(glitch(0.12), portal_end, 0.18, pan=0.2)
# snare roll 16ths into the drop
for k in range(int((drop - portal_end) / (S16 / 2))):
    tt = portal_end + k * S16 / 2
    drums.add(snare(0.16, 200 + 6 * k), tt, 0.12 + 0.03 * k, pan=0.15 * (-1) ** k)

# ---- 4 → 16 s · the groove ---------------------------------------------------
PROG = [  # (start, chord, bass root)
    (4.0, ['A3', 'C4', 'E4', 'G4'], 'A2'),
    (6.0, ['F3', 'A3', 'C4', 'E4'], 'F2'),
    (8.0, ['C4', 'E4', 'G4', 'D4'], 'C3'),
    (10.0, ['G3', 'B3', 'D4', 'E4'], 'G2'),
    (12.0, ['A3', 'C4', 'E4', 'G4'], 'A2'),
    (14.0, ['F3', 'A3', 'C4', 'E4'], 'F2'),
    (15.0, ['G3', 'B3', 'D4', 'F4'], 'G2'),
]
breaks = [(roll3 - S16 * 1.5, roll3), (roll4 - S16 * 1.5, roll4), (mont + 1.5, end)]  # drum drop-outs


def in_break(t):
    return any(a <= t < b for a, b in breaks)


kick_times = []
t = drop
while t < end - 1e-6:
    if not in_break(t):
        drums.add(kick(), t, 1.0)
        kick_times.append(t)
    t += BEAT
# claps on 2 & 4
for bar in np.arange(drop, end, BAR):
    for off in (BEAT, 3 * BEAT):
        tt = bar + off
        if not in_break(tt):
            drums.add(clap(), tt, 0.5)
            send_short.add(clap(), tt, 0.35)
# hats: 16ths with an off-beat open hat, humanised
k = 0
t = drop
while t < end - 1e-6:
    pos = k % 4
    if not in_break(t):
        if pos == 2:
            drums.add(hat(0.32, 0.16, 6500), t, 0.15, pan=0.25)
        else:
            vel = {0: 0.10, 1: 0.055, 3: 0.07}[pos] * rng.uniform(0.85, 1.1)
            drums.add(hat(), t + rng.uniform(-0.002, 0.002), vel, pan=0.3 if pos % 2 else -0.15)
    k += 1
    t += S16
# ride + extra perc to lift the montage
for tt in np.arange(mont, mont + 1.5, BEAT / 2):
    drums.add(ride(), tt, 0.10, pan=-0.35)
# montage build: snare roll + riser into the end card
for k in range(8):
    drums.add(snare(0.2, 190 + 8 * k), mont + 1.0 + k * S16, 0.12 + 0.03 * k)
for k in range(8):
    drums.add(snare(0.14, 260 + 10 * k), mont + 1.5 + k * S16 / 2, 0.2 + 0.035 * k, pan=0.2 * (-1) ** k)
sfx.add(riser(1.1, 400, 11000, 'G3', 'G5', 2.4), end - 1.1, 0.4)
sfx.add(reverse_crash(0.9), end - 0.9, 0.55)

# bass: rolling off-beat 8ths + sustained sub, following the chords
for i, (start, chord, root) in enumerate(PROG):
    stop = PROG[i + 1][0] if i + 1 < len(PROG) else end
    for tt in np.arange(start, stop - 1e-6, BEAT / 2):
        if in_break(tt):
            continue
        offbeat = abs(((tt - start) / BEAT) % 1 - 0.5) < 1e-6
        f = hz(root) * (2 if (offbeat and rng.random() < 0.25) else 1)
        bass.add(bass_note(f, BEAT / 2 - 0.01), tt, 0.62 if offbeat else 0.32)
    # pads
    p = supersaw([hz(n_) for n_ in chord], stop - start, 0.03, 0.35, 2200 if start < mont else 3400, 5, 0.13)
    pads.add(p, start, 0.5)
    send_long.add(p, start, 0.35)
    # 16th arp over chord tones (+ octave), rising pattern
    tones = [hz(n_) for n_ in chord] + [hz(chord[0]) * 2, hz(chord[2]) * 2]
    order = [0, 1, 2, 3, 4, 2, 5, 1]
    for k, tt in enumerate(np.arange(start, stop - 1e-6, S16)):
        if in_break(tt):
            continue
        acc = 1.0 if k % 4 == 0 else 0.75
        arp.add(pluck(tones[order[k % 8]], 0.22), tt, 0.26 * acc, pan=0.45 * np.sin(k * 0.9))

# ---- feature transitions -------------------------------------------------------
sfx.add(glitch(0.1), TL['f1']['candles'], 0.2, pan=-0.1)
sfx.add(ui_click(3200), TL['f1']['candles'], 0.35)
sfx.add(whoosh(0.35, 500, 4200, 0.5, -0.3, 0.3), TL['f1']['candles'] - 0.12, 0.35)
sfx.add(whoosh(0.34, 600, 6000, 0.5, -0.9, 0.9, 1.6), TL['f2']['whip'] - 0.17, 1.0)
sfx.add(whoosh(0.5, 250, 2600, 0.45, 0.5, 0.2), TL['f2']['whip'] + 0.12, 0.45)  # ticket lifts
sfx.add(ui_click(2600), TL['f2']['limitClick'], 0.55, pan=0.3)
sfx.add(bell(hz('E6'), 0.5), TL['f2']['limitClick'] + 0.01, 0.08, pan=0.3)
sfx.add(whoosh(0.3, 500, 4500, 0.5, 0.4, -0.4), TL['f2']['positions'] - 0.12, 0.55)
for roll in (roll3, roll4):
    sfx.add(ui_click(3400), roll - 0.07, 0.6, pan=0.0)  # nav tab hit
    sfx.add(whoosh(0.42, 300, 3600, 0.55, 0.0, 0.0, 1.0), roll - 0.2, 0.9)  # vertical roll
    sfx.add(boom(0.9, 0.35), roll, 0.4)
sfx.add(ui_click(2800), TL['f3']['usClick'], 0.55, pan=-0.3)
sfx.add(whoosh(0.45, 400, 3800, 0.4, 0.9, 0.2), TL['f3']['panel'] - 0.1, 0.55)  # panel slides in
sfx.add(whoosh(0.5, 250, 2400, 0.45, -0.3, 0.1), roll4 + 0.35, 0.4)  # barometer lifts
sfx.add(glitch(0.1), TL['f4']['corr'], 0.22, pan=0.2)
sfx.add(whoosh(0.3, 500, 4500, 0.5, -0.4, 0.4), TL['f4']['corr'] - 0.12, 0.5)
sfx.add(whoosh(0.7, 200, 3000, 0.25, 0.0, 0.0, 0.9), mont - 0.12, 0.7)  # pull back to the wall
for c, note in zip(TL['montage']['chips'], ['E5', 'G5', 'C6']):
    sfx.add(pop(hz(note), 0.18), c, 0.5, pan=-0.35 + 0.35 * TL['montage']['chips'].index(c))
    sfx.add(bell(hz(note), 0.9), c, 0.11)

# ---- 16 → 19 s · end card --------------------------------------------------------
impacts.add(boom(3.0, 1.05), end, 1.0)
cmaj9 = [hz('C3'), hz('G3'), hz('B3'), hz('D4'), hz('E4')]
stab = supersaw(cmaj9, 0.3, 0.004, 1.8, 2000, 7, 0.2, decay=0.9, bright=8000)
impacts.add(stab, end, 0.85)
send_long.add(stab, end, 1.0)
bass.add(bass_note(hz('C3'), 0.9), end, 0.9)
pads.add(supersaw([hz('C3'), hz('G3'), hz('E4'), hz('B3')], 2.2, 0.5, 0.9, 1600, 5, 0.12), end + 0.3, 0.45)
for k, dt in enumerate(np.cumsum(np.linspace(0.010, 0.026, 7))):  # wordmark reels
    sfx.add(tick(f=3400), end - 0.12 + dt, 0.18, pan=-0.5 + k / 6)
for k in range(12):
    sfx.add(blip(rng.uniform(1800, 4000)), end + 0.14 + k * 0.028, 0.055, pan=rng.uniform(-0.5, 0.5))
for k in range(16):
    sfx.add(blip(rng.uniform(2000, 4600)), TL['end']['url'] + k * 0.024, 0.045, pan=rng.uniform(-0.4, 0.4))
sfx.add(whoosh(0.4, 400, 3500, 0.6, -0.2, 0.2), TL['end']['cta'] - 0.15, 0.4)
sfx.add(pop(hz('C5'), 0.2), TL['end']['cta'] + 0.05, 0.35)
click = TL['end']['click']
sfx.add(ui_click(3000), click, 0.8, pan=0.25)
for k, note in enumerate(['C6', 'E6', 'G6', 'C7']):
    sfx.add(bell(hz(note), 1.4), click + 0.035 * k, 0.16 - 0.02 * k, pan=0.25)
for k in range(10):
    sfx.add(blip(rng.uniform(5000, 9000), 0.02), click + 0.02 + k * 0.02, 0.05, pan=rng.uniform(-0.2, 0.7))
# the groove carries the end card, filtered down, then a clean final button on 18 s
for tt in np.arange(end, end + 2.0 - 1e-6, BEAT):
    drums.add(kick(0.5, 150, 44, 0.03, 0.26), tt, 0.72)
    kick_times.append(tt)
for tt in np.arange(end + BEAT, end + 2.0, 2 * BEAT):
    drums.add(clap(), tt, 0.3)
for k, tt in enumerate(np.arange(end, end + 2.0 - 1e-6, S16)):
    arp.add(pluck(hz(['C4', 'E4', 'G4', 'B4', 'D5', 'G4', 'E4', 'B3'][k % 8]), 0.2, 3600 - 1400 * k / 32, 500, 0.06), tt, 0.2 * (1 - k / 40))
    if k % 2 == 1:
        drums.add(hat(), tt, 0.06)
final = end + 2.0
drums.add(kick(0.6, 150, 42, 0.03, 0.35), final, 0.9)
kick_times.append(final)
fin = supersaw([hz('C3'), hz('G3'), hz('C4'), hz('E4'), hz('G4')], 0.2, 0.004, 1.2, 1800, 7, 0.16, decay=0.5, bright=6000)
pads.add(fin, final, 0.8)
send_long.add(fin, final, 0.9)
bass.add(bass_note(hz('C3'), 0.7), final, 0.8)
sfx.add(bell(hz('G5'), 1.2), final, 0.08)

# --------------------------------------------------------------------------
# Mix & master
# --------------------------------------------------------------------------

def prehit_duck(hits):
    """Trailer-style 'suck': everything dips just before a big hit so the hit lands harder."""
    env = np.ones(N)
    for h, depth, length in hits:
        a, b = int((h - length) * SR), int(h * SR)
        n = b - a
        shape = 1 - depth * (0.5 - 0.5 * np.cos(np.pi * np.clip(np.arange(n) / (0.65 * n), 0, 1)))
        env[a:b] = np.minimum(env[a:b], shape)
    return env


duck = prehit_duck([
    (land, 0.85, 0.09),
    (portal_end, 0.55, 0.06),
    (drop, 0.8, 0.08),
    (roll3, 0.3, 0.05),
    (roll4, 0.3, 0.05),
    (end, 0.9, 0.1),
    (end + 2.0, 0.5, 0.06),
])

sc = sidechain(kick_times, 0.62, 0.15)
sc_soft = sidechain(kick_times, 0.35, 0.12)
bass.x *= sc
pads.x *= sc
arp.x *= sc_soft

arp_fx = pingpong(arp.x, 0.375, 0.36, 6)
hall = reverb(send_long.x + 0.35 * arp.x + 0.25 * sfx.x + 0.5 * impacts.x, reverb_ir(2.4, 3.2, 0.02, 6000, 3))
room = reverb(send_short.x + 0.25 * drums.x, reverb_ir(0.7, 1.0, 0.006, 8000, 5))

bass.x = filt(bass.x, 'hp', 32, 2)
pads.x = filt(pads.x, 'hp', 120, 1)
arp.x = filt(arp.x, 'hp', 180, 1)

mix = (
    0.88 * drums.x
    + 0.80 * bass.x
    + 0.55 * pads.x
    + 0.62 * arp.x
    + 0.30 * arp_fx
    + 0.90 * sfx.x
    + 0.85 * ambience.x
    + 0.30 * hall
    + 0.22 * room
) * duck + 0.95 * impacts.x

# sub-sonic clean-up, gentle glue, soft saturation, loudness target, brick-wall
mix = filt(mix, 'hp', 30, 2)
mix = shelf(mix, 6500, -3.5, 'high')
mix = filt(mix, 'lp', 17000, 2)
mix = compress(mix, -18, 2.0, 0.01, 0.18, 2.0)
mix = np.tanh(mix * 0.9) / 0.9
meter = pyln.Meter(SR)
for _ in range(3):
    lufs = meter.integrated_loudness(mix.T)
    mix *= 10 ** ((-14.0 - lufs) / 20)
    mix = limiter(mix, -1.6)
# end: let the last tail breathe out, no click
t = tvec(N)
mix *= np.clip((DUR - t) / 0.35, 0, 1) ** 1.5
mix[:, : int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))

os.makedirs(os.path.join(ROOT, 'public', 'audio'), exist_ok=True)
import sys

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'public', 'audio', 'soundtrack.wav')
sf.write(out, mix.T.astype(np.float32), SR, subtype='PCM_24')
print(f'wrote {out}: {DUR:.2f}s, {meter.integrated_loudness(mix.T):.1f} LUFS, peak {20 * np.log10(np.abs(mix).max()):.2f} dBFS')
