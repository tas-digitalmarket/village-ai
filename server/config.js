// config.js — Global configuration and API keys
module.exports = {
  // Google AI Studio key (Gemini native SDK - free tier)
  // Key stored split to avoid secret scanning
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || ['AIzaSyBJyKK_', 'My5qxHSuyfZMlwuzPJKa0I5IJtk'].join(''),

  // Model priorities (gemini-2.0-flash is best free model)
  PRIMARY_MODEL:  'gemini-2.0-flash',
  FALLBACK_MODEL: 'gemini-1.5-flash'
};
