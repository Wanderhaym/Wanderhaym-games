import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ImpactAudio } from '../src/audio/ImpactAudio.ts';
import { connectLoaderImpactSound } from '../src/ui/LoaderImpactSound.ts';

class FakeAudio extends EventTarget {
  readyState = 0;
  paused = true;
  playCalls = 0;
  loadCalls = 0;
  failSeek = false;
  playHandler = () => Promise.resolve();
  setAttribute() {}
  set currentTime(value) { if (this.failSeek) throw new Error('No metadata'); }
  load() { this.loadCalls++; }
  pause() { this.paused = true; }
  play() { this.playCalls++; this.paused = false; return this.playHandler(); }
}

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audio = new FakeAudio();
  const states = [];
  const player = new ImpactAudio('/hammer-hit.wav', {
    createAudio: () => audio,
    report: (state, error) => states.push({ state, error }),
  });
  t.after(() => player.stop());
  return { audio, states, player };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('autoplay is attempted with no gesture, music or preload events', async (t) => {
  const { audio, states, player } = setup(t);
  player.prepare();
  assert.equal(audio.playCalls, 0, 'preparation must be silent');
  player.play();
  await flush();
  assert.equal(audio.readyState, 0);
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.volume, 0.075);
  assert.equal(states.at(-1).state, 'playing');
});

test('missing metadata does not prevent the first play request', async (t) => {
  const { audio, player, states } = setup(t);
  audio.failSeek = true;
  player.play();
  await flush();
  assert.equal(audio.playCalls, 1);
  assert.equal(states.at(-1).state, 'playing');
});

test('autoplay rejection is reported and a later visible hit can retry', async (t) => {
  const { audio, player, states } = setup(t);
  audio.playHandler = () => Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
  player.play();
  await flush();
  assert.deepEqual(states.at(-1), { state: 'blocked', error: 'NotAllowedError' });
  audio.playHandler = () => Promise.resolve();
  player.play(0.065);
  await flush();
  assert.equal(states.at(-1).state, 'playing');
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.volume, 0.065);
});

test('a delayed WAV is stopped and cannot revive an old hit', async (t) => {
  const { audio, player, states } = setup(t);
  let resolve;
  audio.playHandler = () => new Promise((done) => { resolve = done; });
  player.play();
  t.mock.timers.tick(181);
  assert.equal(audio.paused, true);
  assert.equal(states.at(-1).state, 'late');
  resolve();
  await flush();
  assert.equal(states.at(-1).state, 'late');
});

test('a late playing event is rejected even if its timer was delayed', (t) => {
  const { audio, player, states } = setup(t);
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  audio.playHandler = () => new Promise(() => {});
  player.play();
  now = 400;
  audio.dispatchEvent(new Event('playing'));
  assert.equal(audio.paused, true);
  assert.equal(states.at(-1).state, 'late');
});

test('finishing the splash cancels pending audio but preserves a playing tail', async (t) => {
  const { audio, player, states } = setup(t);
  audio.playHandler = () => new Promise(() => {});
  player.play();
  player.stopPending();
  assert.equal(audio.paused, true);
  assert.equal(states.at(-1).state, 'idle');
  audio.playHandler = () => Promise.resolve();
  player.play();
  await flush();
  player.stopPending();
  assert.equal(audio.paused, false);
});

test('old promise callbacks cannot cancel a newer hit', async (t) => {
  const { audio, player, states } = setup(t);
  let reject;
  audio.playHandler = () => new Promise((_, fail) => { reject = fail; });
  player.play();
  audio.playHandler = () => Promise.resolve();
  player.play();
  await flush();
  reject(new DOMException('Cancelled', 'AbortError'));
  await flush();
  assert.equal(states.at(-1).state, 'playing');
  assert.equal(audio.paused, false);
});

test('legacy play without a promise uses the playing event', (t) => {
  const { audio, player, states } = setup(t);
  audio.playHandler = () => undefined;
  player.play();
  assert.equal(states.at(-1).state, 'starting');
  audio.dispatchEvent(new Event('playing'));
  assert.equal(states.at(-1).state, 'playing');
  t.mock.timers.tick(500);
  assert.equal(audio.paused, false);
});

test('synchronous media failures are reported, not thrown into the animation', (t) => {
  const { audio, player, states } = setup(t);
  audio.playHandler = () => { throw new DOMException('Bad file', 'NotSupportedError'); };
  assert.doesNotThrow(() => player.play());
  assert.deepEqual(states.at(-1), { state: 'error', error: 'NotSupportedError' });
});

test('the loader adapter triggers sound only at contact and disconnects at completion', (t) => {
  let notify;
  let disconnected = false;
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    constructor(callback) { notify = callback; }
    observe(root, options) { assert.deepEqual(options.attributeFilter, ['data-state']); }
    disconnect() { disconnected = true; }
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = previous;
  });
  const root = { dataset: { state: 'windup' } };
  let plays = 0;
  let stops = 0;
  connectLoaderImpactSound(root, () => plays++, () => stops++);
  notify();
  assert.equal(plays, 0);
  root.dataset.state = 'contact';
  notify();
  assert.equal(plays, 1);
  root.dataset.state = 'complete';
  notify();
  assert.equal(stops, 1);
  assert.equal(disconnected, true);
});

test('world impacts are independent of music, and the kit player cannot double sound', async () => {
  const experience = await readFile(new URL('../src/core/Experience.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(experience, /audioUnlocked/);
  assert.match(experience, /playAppImpact\('world', 0\.065\)/);
  assert.match(experience, /if \(!this\.loader\.classList\.contains\('is-hidden'\)\) return/);
  const loader = await readFile(new URL('../src/ui/ForgeLoader.ts', import.meta.url), 'utf8');
  assert.match(loader, /soundVolume: 0/);
  assert.match(loader, /playAppImpact\('loader', 0\.075\)/);
});
