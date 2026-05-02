// logging_middleware/test.js
const { Log } = require('./logger');

async function test() {
  const result = await Log(
    "backend", 
    "info", 
    "middleware", 
    "Logging middleware initialized successfully"
  );
  console.log(result);
}

test();