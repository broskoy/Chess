// Sound effects synthesized with the Web Audio API, so no audio files are needed.

let context = null;

// Browsers only allow audio after a user gesture; sounds are played from
// clicks, so the context is created (or resumed) lazily on first use.
function audio() {
    context ??= new AudioContext();
    if (context.state === 'suspended') context.resume();
    return context;
}

// A short burst of filtered noise, like a piece being set down on wood.
function knock({ frequency, duration, volume, delay = 0 }) {
    const ctx = audio();
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 4;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + delay);
}

// A pure tone that fades out.
function tone({ frequency, duration, volume, delay = 0, type = 'sine' }) {
    const ctx = audio();
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
}

export const sounds = {
    move() {
        knock({ frequency: 900, duration: 0.08, volume: 1.2 });
    },
    capture() {
        knock({ frequency: 550, duration: 0.12, volume: 1.6 });
        knock({ frequency: 1100, duration: 0.06, volume: 0.8, delay: 0.05 });
    },
    // Two light taps: the piece is placed rather than slid.
    drop() {
        knock({ frequency: 1500, duration: 0.05, volume: 0.7 });
        knock({ frequency: 1000, duration: 0.07, volume: 1.0, delay: 0.07 });
    },
    check() {
        tone({ frequency: 880, duration: 0.18, volume: 0.12, delay: 0.08, type: 'triangle' });
    },
    gameEnd() {
        [523, 659, 784].forEach((frequency, i) => {
            tone({ frequency, duration: 0.35, volume: 0.12, delay: 0.1 + i * 0.12 });
        });
    },
};
