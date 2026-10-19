import { describe, expect, it } from 'vitest';
import {
  classifyByBody,
  classifyByContentType,
  classifyByExtension,
  pickBest,
} from '../src/vsl/media-classification.js';

describe('VSL media classification', () => {
  it('ignores query tokens while preserving extension classification', () => {
    expect(classifyByExtension('https://example.invalid/VIDEO.M3U8?token=fixture')).toBe('hls');
    expect(classifyByExtension('https://example.invalid/video.mpd')).toBe('dash');
    expect(classifyByExtension('https://example.invalid/video.m4v')).toBe('mp4');
    expect(classifyByExtension('https://example.invalid/segment.m4s')).toBe('segment');
    expect(classifyByExtension('https://example.invalid/video')).toBeNull();
  });

  it('recognizes only manifest content types and body signatures', () => {
    expect(classifyByContentType('application/vnd.apple.mpegurl')).toBe('hls');
    expect(classifyByContentType('application/dash+xml')).toBe('dash');
    expect(classifyByContentType(undefined)).toBeNull();
    expect(classifyByBody('#EXTM3U\n#EXT-X-VERSION:3')).toBe('hls');
    expect(classifyByBody('<MPD xmlns="urn:mpeg:dash:fixture">')).toBe('dash');
    expect(classifyByBody('<html>fixture</html>')).toBeNull();
  });

  it('prefers HLS over DASH and MP4, never picking segment clues', () => {
    const observed = [
      { url: 'segment', kind: 'segment', source: 'extension' },
      { url: 'mp4', kind: 'mp4', source: 'extension' },
      { url: 'dash', kind: 'dash', source: 'extension' },
      { url: 'hls', kind: 'hls', source: 'extension' },
    ] as const;
    expect(pickBest([...observed])?.url).toBe('hls');
    expect(pickBest(observed.slice(0, 3))?.url).toBe('dash');
    expect(pickBest(observed.slice(0, 1))).toBeUndefined();
  });
});
