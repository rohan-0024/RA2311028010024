// vehicle_maintence_scheduler/knapsack.js

/**
 * 0/1 Knapsack — no external libraries
 * vehicles: [{TaskID, Duration, Impact}]
 * capacity: MechanicHours (integer)
 */
function knapsack(vehicles, capacity) {
  const n = vehicles.length;
  
  // Build DP table
  const dp = [];
  for (let i = 0; i <= n; i++) {
    dp[i] = new Array(capacity + 1).fill(0);
  }

  for (let i = 1; i <= n; i++) {
    const duration = vehicles[i - 1].Duration;
    const impact = vehicles[i - 1].Impact;
    
    for (let w = 0; w <= capacity; w++) {
      // Option 1: Skip this vehicle
      dp[i][w] = dp[i - 1][w];
      
      // Option 2: Include this vehicle (if it fits)
      if (duration <= w) {
        const withVehicle = dp[i - 1][w - duration] + impact;
        if (withVehicle > dp[i][w]) {
          dp[i][w] = withVehicle;
        }
      }
    }
  }

  // Backtrack to find which vehicles were selected
  const selectedVehicles = [];
  let remainingCapacity = capacity;
  
  for (let i = n; i > 0; i--) {
    if (dp[i][remainingCapacity] !== dp[i - 1][remainingCapacity]) {
      selectedVehicles.push(vehicles[i - 1]);
      remainingCapacity -= vehicles[i - 1].Duration;
    }
  }

  return {
    totalImpact: dp[n][capacity],
    totalDurationUsed: capacity - remainingCapacity,
    selectedVehicles: selectedVehicles
  };
}

module.exports = { knapsack };