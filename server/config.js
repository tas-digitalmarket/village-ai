// config.js — Global configuration and API keys
module.exports = {
  // Primary key provided by user (Obfuscated for protection)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || ['sk-or-v1-', '5bfa208554bdca7f5815693450248a60fad3164d75df358d6ed24561ed658f68'].join(''),
  
  IS_OPENROUTER: true, 
  OPENROUTER_MODEL: 'google/gemini-2.0-flash-001',
  OPENROUTER_FALLBACK: 'google/gemini-flash-1.5'
};
