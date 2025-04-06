# AIWEBot Express Backend

This is an Express backend application that provides an API endpoint to execute AIWEBot commands.

## Project Structure

```
backend/
├── src/
│   ├── controllers/     # Request handlers
│   ├── routes/          # API route definitions
│   ├── services/        # Business logic
│   ├── index.ts         # Application entry point
│   └── test-client.ts   # Client for testing the API
├── dist/                # Compiled JavaScript files
├── .env                 # Environment variables
├── package.json         # Project dependencies
└── tsconfig.json        # TypeScript configuration
```

## Setup

1. Make sure you have Node.js installed
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   INVBG_API_KEY=your_invbg_api_key
   PORT=3000
   ```

## Usage

### Start the server

```
npm run dev
```

This will start the Express server on port 3000 (or the port specified in the .env file).

### API Endpoints

#### Execute AIWEBot Command

```
POST /api/execute-command
```

Request body:
```json
{
  "command": "Your command string here"
}
```

Response:
```json
{
  "result": "AIWEBot response"
}
```

#### Health Check

```
GET /api/health
```

Response: `OK`

### Test Client

You can use the test client to try out the API:

```
npm run test-client
```

### Testing with cURL

You can also test the API using cURL:

```bash
# Health check
curl http://localhost:3000/api/health

# Execute a command
curl -X POST \
  http://localhost:3000/api/execute-command \
  -H 'Content-Type: application/json' \
  -d '{"command": "What is my last invoice in invbg (inv.bg), the service name is invbg. Who is the client and what is the amount due?"}'
```

## Build for Production

```
npm run build
npm start
``` 