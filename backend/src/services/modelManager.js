// modelManager.js
// Dynamic Gemini model selector with least-token prioritization and automatic fallback.

export const TOKEN_RANKED_MODELS = [
  'gemini-3.5-flash-lite',               // Lowest token consumption & compute footprint, high throughput
  'gemini-flash-lite-latest',           // Alias for latest flash-lite
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',                   // Fast standard model
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
  'gemini-2.5-pro',
  'gemini-pro-latest',
];

let cachedAvailableModels = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Dynamically queries Google Generative Language API to discover which models
 * are currently available for this API key, ordered by least token consumption.
 */
export async function getAvailableLeastModels(apiKey) {
  const now = Date.now();
  if (cachedAvailableModels && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedAvailableModels;
  }

  if (!apiKey) {
    return TOKEN_RANKED_MODELS;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models)) {
        const activeModelSet = new Set(
          data.models
            .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map((m) => m.name.replace(/^models\//, ''))
        );

        const available = TOKEN_RANKED_MODELS.filter((m) => activeModelSet.has(m));
        if (available.length > 0) {
          cachedAvailableModels = available;
          lastCacheTime = now;
          console.log(`[AI] Dynamically detected ${available.length} active models (least token ordered):`, available);
          return available;
        }
      }
    }
  } catch (err) {
    console.warn(`[AI] Could not fetch live model list (${err.message}). Using standard ranked fallback list.`);
  }

  return TOKEN_RANKED_MODELS;
}

/**
 * Executes generateContent with dynamic fallback across least-token models.
 */
export async function generateContentWithDynamicFallback({
  ai,
  apiKey,
  prompt,
  preferredModel,
}) {
  const availableModels = await getAvailableLeastModels(apiKey);

  const candidates = [];
  if (preferredModel && !candidates.includes(preferredModel)) {
    candidates.push(preferredModel);
  }

  for (const m of availableModels) {
    if (!candidates.includes(m)) {
      candidates.push(m);
    }
  }

  let lastError = null;

  for (const modelName of candidates) {
    try {
      console.log(`[AI] Generating answer with model: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });

      console.log(`[AI] Successfully generated answer using model: ${modelName}`);
      return {
        text: response.text,
        modelUsed: modelName,
      };
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '');
      console.warn(`[AI] Model "${modelName}" failed: ${msg}. Checking next available least-token model...`);

      // If blocked by content safety, rethrow
      if (msg.includes('SAFETY')) {
        throw err;
      }
      // For 503 (high demand/unavailable), 429 (quota/rate limit), 404 (not found), 500:
      // continue loop to try next model!
    }
  }

  throw lastError || new Error('All AI models are currently unavailable.');
}
