const axios = require('axios');
require('dotenv').config({ path: '../.env' });
const { Log } = require('../logging_middleware/logger');

const BASE_URL = process.env.BASE_URL;
const TOKEN = process.env.ACCESS_TOKEN;

const TYPE_WEIGHT = {
  Placement: 3,
  Result: 2,
  Event: 1
};

function scoreNotification(notification) {
  const typeWeight = TYPE_WEIGHT[notification.Type] || 0;
  const ageMs = Date.now() - new Date(notification.Timestamp).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const recencyScore = Math.exp(-ageHours / 24);
  return (typeWeight * 10) + (recencyScore * 5);
}

async function getTopNNotifications(n = 10) {
  await Log("backend", "info", "service",
    `Fetching top ${n} priority notifications`);

  const response = await axios.get(
    `${BASE_URL}/notifications`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );

  const notifications = response.data.notifications;

  await Log("backend", "debug", "service",
    `Fetched ${notifications.length} notifications, computing priority scores`);

  // Score all notifications
  const scored = notifications.map(n => ({
    ...n,
    priorityScore: parseFloat(scoreNotification(n).toFixed(4))
  }));

  // Sort by score descending
  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  const topN = scored.slice(0, n);

  await Log("backend", "info", "service",
    `Top ${n} notifications selected. Highest score: ${topN[0]?.priorityScore}`);

  return topN;
}

module.exports = { getTopNNotifications, scoreNotification };