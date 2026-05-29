const realtimeConfig = require('./utils/realtimeConfig');
require('dotenv').config();
console.log("Realtime Mode:", realtimeConfig.getRealtimeMode());
