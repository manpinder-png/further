import test from "node:test";
import assert from "node:assert/strict";
import { encodeWav, resample } from "../lib/client/audio.ts";

test("microphone upload is mono 24 kHz 16-bit PCM WAV with correctly sized chunks", async () => {
  const blob = encodeWav(new Float32Array([-1, 0, 1]), 24_000);
  assert.equal(blob.type, "audio/wav");
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  const tag = (offset: number, length: number) => new TextDecoder().decode(bytes.slice(offset, offset + length));
  assert.equal(tag(0, 4), "RIFF");
  assert.equal(tag(8, 4), "WAVE");
  assert.equal(view.getUint32(4, true), bytes.byteLength - 8);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 24_000);
  assert.equal(view.getUint32(28, true), 48_000);
  assert.equal(view.getUint16(32, true), 2);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(tag(36, 4), "data");
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), -32767);
  assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(48, true), 32767);
});

test("PCM encoding clips out-of-range input instead of wrapping polarity", async () => {
  const bytes = await encodeWav(new Float32Array([-4, 4]), 24_000).arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(view.getInt16(44, true), -32767);
  assert.equal(view.getInt16(46, true), 32767);
});

test("resampling joins recording chunks and converts 48 kHz input to 24 kHz", () => {
  const output = resample([new Float32Array([0, .25, .5]), new Float32Array([.75, 1, .75, .5, .25])], 48_000, 24_000);
  assert.deepEqual([...output], [0, .5, 1, .5]);
  assert.equal(resample([], 48_000, 24_000).length, 0);
  assert.deepEqual([...resample([new Float32Array([.25, .5])], 24_000, 24_000)], [.25, .5]);
});
