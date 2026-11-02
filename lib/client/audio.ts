// Browser microphone encoding for the documented Meta transcription upload format.
export function resample(chunks: Float32Array[], from: number, to: number) {
  const total = chunks.reduce((n, part) => n + part.length, 0);
  const input = new Float32Array(total);
  let offset = 0;
  for (const part of chunks) { input.set(part, offset); offset += part.length; }
  if (from === to || !input.length) return input;
  const length = Math.max(1, Math.round(input.length * to / from));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const at = i * from / to;
    const lo = Math.floor(at), hi = Math.min(lo + 1, input.length - 1), mix = at - lo;
    output[i] = input[lo] * (1 - mix) + input[hi] * mix;
  }
  return output;
}

export function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (at: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
  ascii(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); ascii(8, "WAVE");
  ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buffer], { type: "audio/wav" });
}

