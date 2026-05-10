// config.js - Global configuration
const fs = require('fs');

const missing = 'MISSING_KEY';

function readSecretFile(name) {
  try {
    const value = fs.readFileSync(`/etc/secrets/${name}`, 'utf8').trim();
    return value || '';
  } catch (_) {
    return '';
  }
}

const rawOpenRouterKey = process.env.OPENROUTER_API_KEY || '';
const rawSambaNovaKey = process.env.SAMBANOVA_API_KEY || '';
const rawGeminiKey = process.env.GEMINI_API_KEY || readSecretFile('GEMINI_API_KEY') || '';
const openRouterKeyFromAlias = rawSambaNovaKey.startsWith('sk-or-') ? rawSambaNovaKey : '';
const sambaNovaKey = rawSambaNovaKey && !rawSambaNovaKey.startsWith('sk-or-') ? rawSambaNovaKey : '';

module.exports = {
  OPENROUTER_API_KEY: rawOpenRouterKey || openRouterKeyFromAlias || missing,
  SAMBANOVA_API_KEY: sambaNovaKey || missing,
  GEMINI_API_KEY: rawGeminiKey || missing,
  CREATOR_TOKEN: process.env.CREATOR_TOKEN || '',
  DEBUG_ENABLED: process.env.DEBUG_ENABLED === 'true',
  PRIMARY_MODEL: process.env.PRIMARY_MODEL || 'openai/gpt-oss-20b:free',
  FALLBACK_MODEL: process.env.FALLBACK_MODEL || 'meta-llama/llama-3.2-3b-instruct:free',
  SAMBANOVA_PRIMARY_MODEL: process.env.SAMBANOVA_PRIMARY_MODEL || 'Meta-Llama-3.3-70B-Instruct',
  SAMBANOVA_FALLBACK_MODEL: process.env.SAMBANOVA_FALLBACK_MODEL || 'DeepSeek-V3.1',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
};
