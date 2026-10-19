/** A public observation may never choose the server's fetch target. */
export function configuredUpsellPage(eventUrl: string, destinations: string[]): string | null {
  try {
    const observed = new URL(eventUrl);
    if (!['http:', 'https:'].includes(observed.protocol)) return null;
    for (const destination of destinations) {
      try {
        const configured = new URL(destination);
        if (
          configured.origin === observed.origin &&
          configured.pathname === observed.pathname &&
          !configured.username &&
          !configured.password
        )
          return configured.toString();
      } catch {
        /* Invalid stored destinations do not provide authority. */
      }
    }
  } catch {
    /* Invalid observations have no identity authority. */
  }
  return null;
}
