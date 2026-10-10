// Tiny in-memory rate limiter: per-IP sliding window plus a global daily cap.
// No external dependencies; state resets when the server restarts.

export function perIpLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> [timestamps]
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of hits) {
      const recent = times.filter((t) => t > cutoff);
      recent.length ? hits.set(ip, recent) : hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => t > now - windowMs);
    if (recent.length >= max) {
      const retryAfter = Math.ceil((recent[0] + windowMs - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message });
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

export function dailyCap({ max, message }) {
  let day = new Date().toISOString().slice(0, 10);
  let count = 0;
  return (req, res, next) => {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; count = 0; }
    if (count >= max) return res.status(429).json({ error: message });
    count++;
    next();
  };
}
