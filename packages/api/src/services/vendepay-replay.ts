export const VENDEPAY_REPLAY_MAX_ATTEMPTS = 5;

export type VendepayReplayFailureTransition = {
  attempts: number;
  replayState: 'quarantined' | 'replay_failed';
  terminal: boolean;
};

export function vendepayReplayFailureTransition(
  attemptsBeforeFailure: number,
): VendepayReplayFailureTransition {
  const attempts = attemptsBeforeFailure + 1;
  const terminal = attempts >= VENDEPAY_REPLAY_MAX_ATTEMPTS;
  return {
    attempts,
    replayState: terminal ? 'replay_failed' : 'quarantined',
    terminal,
  };
}

export function vendepayReplaySucceeded(statusCode: number, responseBody: unknown) {
  if (statusCode < 200 || statusCode >= 300) return false;
  if (!responseBody || typeof responseBody !== 'object') return true;
  return (responseBody as { duplicate?: unknown }).duplicate !== true;
}
