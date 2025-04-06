import fetch from 'node-fetch';

async function testCommand() {
  try {
    console.log('Testing AIWE command execution...');
    
    // Test health endpoint
    const healthResponse = await fetch('http://localhost:3000/api/health');
    const healthStatus = await healthResponse.text();
    console.log('Health check response:', healthStatus);
    
    // Test command execution
    const commandResponse = await fetch('http://localhost:3000/api/execute-command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: "What is my last invoice in invbg (inv.bg), the service name is invbg. Who is the client and what is the amount due?"
      }),
    });

    const data = await commandResponse.json();
    console.log('Command execution response:', data);
  } catch (error) {
    console.error('Error:', error);
  }
}

testCommand(); 