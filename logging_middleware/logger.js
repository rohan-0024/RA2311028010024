// logging_middleware/logger.js

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL;
const TOKEN = process.env.ACCESS_TOKEN;

/**
 * Core log function — call this throughout your app
 * @param {string} stack   - "backend" or "frontend"
 * @param {string} level   - "debug"|"info"|"warn"|"error"|"fatal"
 * @param {string} package - "cache"|"controller"|"db"|"domain"|
 *                           "handler"|"repository"|"route"|"service"|
 *                           "auth"|"config"|"middleware"|"utils"
 * @param {string} message - descriptive log message
 */
async function Log(stack, level, pkg, message) {
  try {
    const response = await axios.post(
      `${BASE_URL}/logs`,
      {
        stack: stack,
        level: level,
        package: pkg,
        message: message
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    // Fallback to console only if log API fails
    console.error('Log API failed:', error.message);
  }
}

module.exports = { Log };