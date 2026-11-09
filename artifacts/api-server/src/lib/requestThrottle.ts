interface RequestThrottleOptions {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export function createRequestThrottle(
  requestDelayMs: number,
  options: RequestThrottleOptions = {}
): () => Promise<void> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let previousRequestAt: number | null = null;

  return async () => {
    if (requestDelayMs > 0 && previousRequestAt !== null) {
      const remainingDelay = requestDelayMs - (now() - previousRequestAt);
      if (remainingDelay > 0) await sleep(remainingDelay);
    }
    previousRequestAt = now();
  };
}
