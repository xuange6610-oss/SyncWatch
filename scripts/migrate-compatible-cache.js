'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffprobePath = require('ffprobe-static').path;

const ANALYSIS_VERSION = 2;
const RECIPE_VERSION = 2;
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;
const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.argv[2] || path.join(root, 'SyncWatch同步观影-Data'));
const stateFile = path.join(dataDir, 'config.json');
const uploadsDir = path.join(dataDir, 'uploads');
const compatibleDir = path.join(dataDir, 'compatible-media');

function probe(filename) {
  const result = spawnSync(ffprobePath, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filename], {
    windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`媒体校验失败：${path.basename(filename)}`);
  return JSON.parse(result.stdout);
}

function fileName(record) {
  const saved = path.basename(String(record.compatibility?.fileName || ''));
  if (/^[a-f0-9-]{16,80}\.mp4$/i.test(saved)) return saved;
  const digest = crypto.createHash('sha256').update(String(record.id || record.storedName || '')).digest('hex').slice(0, 32);
  return `${digest}.mp4`;
}

function sourceMetadata(info) {
  const video = info.streams?.find((stream) => stream.codec_type === 'video');
  const audio = info.streams?.find((stream) => stream.codec_type === 'audio');
  const pixelFormat = String(video?.pix_fmt || '').toLowerCase();
  return {
    analysisVersion: ANALYSIS_VERSION,
    duration: Number(info.format?.duration) || 0,
    width: Number(video?.width) || 0,
    height: Number(video?.height) || 0,
    videoCodec: String(video?.codec_name || '').toUpperCase(),
    audioCodec: String(audio?.codec_name || '').toUpperCase(),
    pixelFormat,
    profile: String(video?.profile || '').slice(0, 60),
    bitDepth: Number(video?.bits_per_raw_sample) || Number(pixelFormat.match(/p(\d{2})(?:le|be)?$/i)?.[1]) || 8,
    language: String(audio?.tags?.language || info.format?.tags?.language || '').slice(0, 30)
  };
}

function needsCompatibility(record) {
  const metadata = record.metadata || {};
  const videoCodec = String(metadata.videoCodec || '').toUpperCase();
  const audioCodec = String(metadata.audioCodec || '').toUpperCase();
  return path.extname(record.originalName || record.storedName || '').toLowerCase() !== '.mp4'
    || !['H264', 'AVC', 'AVC1'].includes(videoCodec) || metadata.pixelFormat !== 'yuv420p'
    || Boolean(audioCodec && !['AAC', 'MP3'].includes(audioCodec))
    || Number(metadata.width) > 1920 || Number(metadata.height) > 1080;
}

function validateOutput(info) {
  const video = info.streams?.find((stream) => stream.codec_type === 'video');
  const audio = info.streams?.find((stream) => stream.codec_type === 'audio');
  const width = Number(video?.width) || 0;
  const height = Number(video?.height) || 0;
  const valid = String(video?.codec_name || '').toLowerCase() === 'h264'
    && String(video?.pix_fmt || '').toLowerCase() === 'yuv420p'
    && width >= 2 && height >= 2 && width <= MAX_WIDTH && height <= MAX_HEIGHT
    && (!audio || String(audio.codec_name || '').toLowerCase() === 'aac');
  return { valid, width, height };
}

const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
let ready = 0;
let native = 0;
let invalid = 0;

for (const record of state.files || []) {
  if (record.category !== 'video' || record.status !== 'approved') continue;
  const sourcePath = path.join(uploadsDir, path.basename(record.storedName || ''));
  const sourceStats = fs.statSync(sourcePath);
  record.size = sourceStats.size;
  record.metadata = sourceMetadata(probe(sourcePath));
  if (!needsCompatibility(record)) { native += 1; continue; }

  const compatibleName = fileName(record);
  const outputPath = path.join(compatibleDir, compatibleName);
  try {
    const outputStats = fs.statSync(outputPath);
    const checked = validateOutput(probe(outputPath));
    if (!outputStats.isFile() || outputStats.size <= 0 || !checked.valid) throw new Error('输出不符合兼容配方');
    record.compatibility = {
      ...record.compatibility,
      fileName: compatibleName, status: 'ready', progress: 100, size: outputStats.size,
      recipeVersion: RECIPE_VERSION, maxWidth: MAX_WIDTH, maxHeight: MAX_HEIGHT,
      width: checked.width, height: checked.height, videoCodec: 'H264', audioCodec: 'AAC',
      sourceSize: sourceStats.size, sourceMtimeMs: Math.trunc(sourceStats.mtimeMs),
      outputMtimeMs: Math.trunc(outputStats.mtimeMs), error: ''
    };
    ready += 1;
  } catch (_) {
    record.compatibility = { ...record.compatibility, fileName: compatibleName, status: 'queued', progress: 0, error: '' };
    invalid += 1;
  }
}

const temporary = `${stateFile}.${process.pid}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
fs.renameSync(temporary, stateFile);
console.log(JSON.stringify({ dataDir, ready, native, invalid }, null, 2));
if (invalid) process.exitCode = 2;
