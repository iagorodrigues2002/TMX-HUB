import type { VslManifestKind } from '@page-cloner/shared';

export interface DetectOptions {
  /** Wall clock cap for the whole detection run (ms). Default 90s. */
  timeoutMs?: number;
  /** Override locale fingerprint. Default pt-BR. */
  locale?: string;
  /** Override geo timezone. Default America/Sao_Paulo. */
  timezone?: string;
  /** Override user-agent. Default: realistic Chrome on Mac. */
  userAgent?: string;
  /** Override viewport. Default 1366x768. */
  viewport?: { width: number; height: number };
  /**
   * 'paid'  : add fbclid + Facebook referer (visit looks like FB ad click)
   * 'organic': strip ad params (fbclid, gclid, utm_*) + no spoofed referer
   * If omitted (or `true`), behaves as 'paid' for backward compat.
   */
  trafficMode?: 'paid' | 'organic';
  /** @deprecated use trafficMode. true = paid, false = organic. */
  spoofAdClick?: boolean;
  /** Logger hook. */
  onLog?: (msg: string) => void;
}

export interface ObservedMedia {
  url: string;
  kind: VslManifestKind | 'segment' | 'unknown';
  source: 'extension' | 'content-type' | 'body-sniff' | 'segment-inference';
}

export interface DetectResult {
  manifestUrl: string;
  manifestKind: VslManifestKind;
  finalPageUrl: string;
  /** Headers the manifest was fetched with — needed by ffmpeg for protected CDNs. */
  headers: Record<string, string>;
  observed: ObservedMedia[];
}
