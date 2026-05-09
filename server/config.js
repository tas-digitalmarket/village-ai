// config.js - Global configuration
const missing = 'MISSING_KEY';

module.exports = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || missing,
  SAMBANOVA_API_KEY: process.env.SAMBANOVA_API_KEY || missing,
  CREATOR_TOKEN: process.env.CREATOR_TOKEN || '',
  DEBUG_ENABLED: process.env.DEBUG_ENABLED === 'true',
  PRIMARY_MODEL: process.env.PRIMARY_MODEL || 'openai/gpt-oss-20b:free',
  FALLBACK_MODEL: process.env.FALLBACK_MODEL || 'meta-llama/llama-3.2-3b-instruct:free',
  SAMBANOVA_PRIMARY_MODEL: process.env.SAMBANOVA_PRIMARY_MODEL || 'Meta-Llama-3.3-70B-Instruct',
  SAMBANOVA_FALLBACK_MODEL: process.env.SAMBANOVA_FALLBACK_MODEL || 'DeepSeek-V3.1'
};
