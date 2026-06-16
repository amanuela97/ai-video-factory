// Retries an async function up to `retries` times with exponential backoff.
// Backoff: 2s, 4s, 6s (linear increase)
export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  label = "operation"
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const waitMs = 2000 * (i + 1);
      console.warn(`Retry ${i + 1}/${retries} for "${label}" failed. Waiting ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }

  throw lastError;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
