const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Parses Google's suggested wait, e.g. "Please retry in 35.2s" or "4h25m31s"
function retryDelaySeconds(msg) {
  const m = msg.match(/retry in ((?:\d+h)?(?:\d+m)?[\d.]+s)/i);
  if (!m) return null;
  const [, h = 0] = m[1].match(/(\d+)h/) || [];
  const [, min = 0] = m[1].match(/(\d+)m(?!s)/) || [];
  const [, s = 0] = m[1].match(/([\d.]+)s/) || [];
  return Number(h) * 3600 + Number(min) * 60 + Number(s);
}

// Retries once on short per-minute limits; fails fast with a readable message otherwise
export async function withRateLimit(fn, retries = 1) {
  try {
    return await fn();
  } catch (err) {
    const msg = String(err?.message || "");
    const isRateLimit = err?.status === 429 || msg.includes("RESOURCE_EXHAUSTED");
    if (!isRateLimit) throw err;

    const wait = retryDelaySeconds(msg) ?? 30;
    if (retries > 0 && wait <= 60) {
      await sleep(wait * 1000 + 500);
      return withRateLimit(fn, retries - 1);
    }
    const e = new Error(
      wait > 60
        ? "Today's free AI quota for this demo is used up. Please try again in a few hours."
        : "The AI service is busy right now. Wait a minute and try again."
    );
    e.status = 429;
    throw e;
  }
}
