// Vercel serverless entry point. vercel.json rewrites every /api/* request here;
// Express's own router handles sub-routing from req.url, same as it does locally.
require('dotenv').config();

module.exports = require('../server/app');
