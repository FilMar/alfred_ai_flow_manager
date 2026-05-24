#!/usr/bin/env bun

import { YoutubeTranscript } from 'youtube-transcript';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: transcript.js <video-id-or-url>');
  process.exit(1);
}

// Extract video ID from URL or use as-is
let videoId = arg;
const urlPatterns = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
  /^([a-zA-Z0-9_-]{11})$/
];

for (const pattern of urlPatterns) {
  const match = arg.match(pattern);
  if (match) {
    videoId = match[1];
    break;
  }
}

try {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  
  for (const entry of transcript) {
    const minutes = Math.floor(entry.offset / 60);
    const seconds = Math.floor(entry.offset % 60);
    const timeStr = `[${minutes}:${seconds.toString().padStart(2, '0')}]`;
    console.log(`${timeStr} ${entry.text}`);
  }
} catch (error) {
  console.error('Error fetching transcript:', error.message);
  process.exit(1);
}
