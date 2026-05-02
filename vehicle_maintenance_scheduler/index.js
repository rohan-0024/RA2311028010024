// vehicle_maintence_scheduler/index.js

const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { Log } = require('../logging_middleware/logger');
const { knapsack } = require('./knapsack');

const app = express();
app.use(express.json());

const BASE_URL = process.env.BASE_URL;
const TOKEN = process.env.ACCESS_TOKEN;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

// GET /vehicle_scheduling/:depotId
app.get('/vehicle_scheduling/:depotId', async (req, res) => {
  const { depotId } = req.params;
  
  await Log("backend", "info", "route", 
    `Vehicle scheduling request received for depotId: ${depotId}`);

  try {
    // Fetch depots and vehicles in parallel
    await Log("backend", "debug", "service", 
      "Fetching depots and vehicles from evaluation API");

    const [depotsRes, vehiclesRes] = await Promise.all([
      axios.get(`${BASE_URL}/depots`, { headers }),
      axios.get(`${BASE_URL}/vehicles`, { headers })
    ]);

    const depots = depotsRes.data.depots;
    const vehicles = vehiclesRes.data.vehicles;

    await Log("backend", "info", "service", 
      `Fetched ${depots.length} depots and ${vehicles.length} vehicles`);

    // Find the requested depot
    const depot = depots.find(d => d.ID === parseInt(depotId));

    if (!depot) {
      await Log("backend", "warn", "handler", 
        `Depot not found for ID: ${depotId}`);
      return res.status(404).json({ error: `Depot with ID ${depotId} not found` });
    }

    await Log("backend", "debug", "service", 
      `Running knapsack for depot ${depotId} with budget: ${depot.MechanicHours} hours`);

    // Run knapsack algorithm
    const result = knapsack(vehicles, depot.MechanicHours);

    await Log("backend", "info", "service", 
      `Knapsack complete. Total impact: ${result.totalImpact}, Vehicles selected: ${result.selectedVehicles.length}`);

    res.json({
      depotId: depot.ID,
      mechanicHoursBudget: depot.MechanicHours,
      totalImpactScore: result.totalImpact,
      hoursUsed: result.totalDurationUsed,
      hoursRemaining: depot.MechanicHours - result.totalDurationUsed,
      vehiclesSelected: result.selectedVehicles.length,
      selectedVehicles: result.selectedVehicles
    });

  } catch (error) {
    await Log("backend", "error", "handler", 
      `Error in vehicle scheduling: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// GET /vehicle_scheduling — show all depots with optimal schedules
app.get('/vehicle_scheduling', async (req, res) => {
  await Log("backend", "info", "route", 
    "Fetching optimal schedule for all depots");

  try {
    const [depotsRes, vehiclesRes] = await Promise.all([
      axios.get(`${BASE_URL}/depots`, { headers }),
      axios.get(`${BASE_URL}/vehicles`, { headers })
    ]);

    const depots = depotsRes.data.depots;
    const vehicles = vehiclesRes.data.vehicles;

    const results = depots.map(depot => {
      const result = knapsack(vehicles, depot.MechanicHours);
      return {
        depotId: depot.ID,
        mechanicHoursBudget: depot.MechanicHours,
        totalImpactScore: result.totalImpact,
        hoursUsed: result.totalDurationUsed,
        selectedVehicles: result.selectedVehicles
      };
    });

    await Log("backend", "info", "service", 
      `Computed schedules for all ${depots.length} depots`);

    res.json({ schedules: results });

  } catch (error) {
    await Log("backend", "error", "handler", 
      `Error fetching all depot schedules: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, async () => {
  await Log("backend", "info", "config", 
    `Vehicle scheduling server started on port ${PORT}`);
  console.log(`Server running on http://localhost:${PORT}`);
});

console.log("Token loaded:", process.env.ACCESS_TOKEN ? "YES" : "NO - CHECK .env");