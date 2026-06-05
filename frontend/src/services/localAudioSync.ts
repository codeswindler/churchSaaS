export interface AudioSyncFrame {
  timeMs: number;
  values: number[];
}

export interface AudioSyncMatch {
  confidence: number;
  offsetMs: number;
}

const FRAME_MS = 250;
const BAND_COUNT = 6;
const MIN_MATCH_FRAMES = 16;

function bucketSamples(data: Float32Array) {
  const buckets = Array.from({ length: BAND_COUNT }, () => 0);
  const counts = Array.from({ length: BAND_COUNT }, () => 0);

  data.forEach((value, index) => {
    const bucket = Math.min(
      BAND_COUNT - 1,
      Math.floor((index / Math.max(1, data.length - 1)) * BAND_COUNT),
    );
    buckets[bucket] += Math.abs(value);
    counts[bucket] += 1;
  });

  return buckets.map((value, index) => value / Math.max(1, counts[index]));
}

function normalizeFrame(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centered = values.map((value) => value - mean);
  const magnitude =
    Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0)) || 1;
  return centered.map((value) => value / magnitude);
}

function scoreFrames(liveFrames: AudioSyncFrame[], referenceFrames: AudioSyncFrame[]) {
  let score = 0;
  let compared = 0;

  liveFrames.forEach((liveFrame, frameIndex) => {
    const referenceFrame = referenceFrames[frameIndex];
    if (!referenceFrame) return;

    const live = normalizeFrame(liveFrame.values);
    const reference = normalizeFrame(referenceFrame.values);
    live.forEach((value, index) => {
      score += value * reference[index];
      compared += 1;
    });
  });

  return compared ? score / compared : 0;
}

export async function buildReferenceAudioFrames(file: File) {
  const buffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  const decoded = await audioContext.decodeAudioData(buffer.slice(0));
  audioContext.close();

  const channel = decoded.getChannelData(0);
  const frameSize = Math.max(1, Math.floor(decoded.sampleRate * (FRAME_MS / 1000)));
  const frames: AudioSyncFrame[] = [];

  for (let index = 0; index < channel.length; index += frameSize) {
    const segment = channel.subarray(index, Math.min(channel.length, index + frameSize));
    frames.push({
      timeMs: Math.round((index / decoded.sampleRate) * 1000),
      values: bucketSamples(segment),
    });
  }

  return frames;
}

export function findBestAudioOffset(
  liveFrames: AudioSyncFrame[],
  referenceFrames: AudioSyncFrame[],
): AudioSyncMatch | null {
  if (
    liveFrames.length < MIN_MATCH_FRAMES ||
    referenceFrames.length < liveFrames.length
  ) {
    return null;
  }

  let bestScore = -Infinity;
  let bestIndex = 0;
  const stride = 2;

  for (
    let referenceIndex = 0;
    referenceIndex <= referenceFrames.length - liveFrames.length;
    referenceIndex += stride
  ) {
    const score = scoreFrames(
      liveFrames,
      referenceFrames.slice(referenceIndex, referenceIndex + liveFrames.length),
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = referenceIndex;
    }
  }

  return {
    confidence: Math.max(0, Math.min(1, (bestScore + 1) / 2)),
    offsetMs: referenceFrames[bestIndex]?.timeMs || 0,
  };
}

export function createLiveAudioSampler(
  stream: MediaStream,
  onFrame: (frame: AudioSyncFrame) => void,
) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const startedAt = Date.now();

  const intervalId = window.setInterval(() => {
    analyser.getFloatTimeDomainData(data);
    onFrame({
      timeMs: Date.now() - startedAt,
      values: bucketSamples(data),
    });
  }, FRAME_MS);

  return () => {
    window.clearInterval(intervalId);
    stream.getTracks().forEach((track) => track.stop());
    audioContext.close();
  };
}
