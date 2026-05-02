const express = require('express');
require('dotenv').config({ path: '../.env' });
const { Log } = require('../logging_middleware/logger');
const { getTopNNotifications } = require('./priorityInbox');

const app = express();
app.use(express.json());

// GET /notifications/priority?n=10
app.get('/notifications/priority', async (req, res) => {
  const n = parseInt(req.query.n) || 10;
  
  await Log("backend", "info", "route",
    `Priority inbox requested for top ${n} notifications`);

  try {
    const topNotifications = await getTopNNotifications(n);
    
    res.json({
      count: topNotifications.length,
      notifications: topNotifications
    });
  } catch (error) {
    await Log("backend", "error", "handler",
      `Failed to fetch priority notifications: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, async () => {
  await Log("backend", "info", "config",
    `Notification backend server started on port ${PORT}`);
  console.log(`Notification server on http://localhost:${PORT}`);
});