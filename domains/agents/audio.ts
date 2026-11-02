import { AgentError } from "./contracts.ts";

/** Meta's file ASR accepts mono 16-bit integer PCM in RIFF/WAVE at 16 or 24 kHz. */
export async function validateMetaWav(audio: Blob, maxDurationSeconds = 600) {
  if (audio.size < 46 || audio.size > 30 * 1024 * 1024) throw new AgentError("INVALID_INPUT", "Upload a nonempty WAV recording under 30 MB.");
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, size: number) => String.fromCharCode(...bytes.subarray(offset, offset + size));
  const invalid = (): never => { throw new AgentError("INVALID_INPUT", "Upload mono 16-bit PCM WAV audio at 16 or 24 kHz."); };
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.length) invalid();
  let sampleRate = 0;
  let dataBytes = 0;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) invalid();
    const kind = ascii(offset, 4), size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > bytes.length) invalid();
    if (kind === "fmt ") {
      if (sampleRate || size < 16) invalid();
      const encoding = view.getUint16(start, true), channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      if (encoding !== 1 || channels !== 1 || ![16_000, 24_000].includes(sampleRate) || view.getUint16(start + 14, true) !== 16 || view.getUint16(start + 12, true) !== 2 || view.getUint32(start + 8, true) !== sampleRate * 2) invalid();
    }
    if (kind === "data") { if (!size || size % 2) invalid(); dataBytes += size; }
    offset = start + size + (size % 2);
    if (offset > bytes.length) invalid();
  }
  if (!sampleRate || !dataBytes) invalid();
  const durationSeconds = dataBytes / (sampleRate * 2);
  if (durationSeconds > maxDurationSeconds) throw new AgentError("INVALID_INPUT", `Keep the recording under ${maxDurationSeconds} seconds.`);
  return { sampleRate, durationSeconds };
}
