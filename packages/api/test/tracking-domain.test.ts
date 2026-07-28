import { describe, expect, it } from 'vitest';
import { canonicalTrackingHostname, cleanHostname } from '../src/services/tracking-domain.js';

describe('tracking domain normalization', () => {
  it('always creates the tmx subdomain from a root domain', () => {
    expect(canonicalTrackingHostname('example.com')).toBe('tmx.example.com');
    expect(canonicalTrackingHostname('track.example.com')).toBe('tmx.example.com');
    expect(canonicalTrackingHostname('tmx.example.com')).toBe('tmx.example.com');
  });

  it('preserves compound public suffixes', () => {
    expect(canonicalTrackingHostname('https://checkout.minhaempresa.com.br/path')).toBe(
      'tmx.minhaempresa.com.br',
    );
  });

  it('cleans protocols, ports and trailing dots', () => {
    expect(cleanHostname(' HTTPS://Sub.Example.com:443/path ')).toBe('sub.example.com');
  });
});
