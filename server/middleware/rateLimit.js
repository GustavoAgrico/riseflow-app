// Simple in-memory rate limiting middleware
// For production with multiple instances, use Redis or external rate limiting service

const rateLimitStore = new Map();
const CLEANUP_INTERVAL = 60000; // 1 minute

// Clean up old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.lastCleanup > CLEANUP_INTERVAL) {
      data.requests = data.requests.filter(t => now - t < data.windowMs);
      data.lastCleanup = now;
      if (data.requests.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Rate limit middleware
 * @param {Object} options - Configuration
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 minutes)
 * @param {number} options.max - Max requests per window (default: 5)
 * @param {Function} options.keyGenerator - Function to generate rate limit key (default: user IP)
 * @param {string} options.message - Error message (default: 'Too many requests')
 * @returns {Function} Express middleware
 */
function createRateLimit(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 5,
    keyGenerator = (req) => req.user?.sub || req.ip,
    message = 'Too many payment requests. Please try again later.',
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    if (!key) return next(); // Skip if no key

    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, {
        requests: [now],
        lastCleanup: now,
      });
      return next();
    }

    const data = rateLimitStore.get(key);

    // Remove old requests outside the window
    data.requests = data.requests.filter(t => now - t < windowMs);

    if (data.requests.length >= max) {
      return res.status(429).json({ error: message });
    }

    data.requests.push(now);
    res.set('X-RateLimit-Limit', max);
    res.set('X-RateLimit-Remaining', max - data.requests.length);
    res.set('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

    next();
  };
}

module.exports = createRateLimit;
