// config.js — Global configuration and API keys
module.exports = {
  // SambaNova Cloud API Key
  SAMBANOVA_API_KEY: process.env.SAMBANOVA_API_KEY || process.env.GEMINI_API_KEY || '337c8305-e3f1-43c7-9ded-56dd19f9fa1d',

  // SambaNova Models
  PRIMARY_MODEL: 'Meta-Llama-3.3-70B-Instruct',
  FALLBACK_MODEL: 'DeepSeek-V3.1'
};
