# Node.js Database Client Example

Simple Node.js application demonstrating how to use the HTTP-based database client.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your credentials:
   - `DB_API_URL`: Database API endpoint (default: `http://localhost:3001`)
   - `DB_ID`: Your database ID
   - `DB_AUTH_TOKEN`: Your authentication token

## Usage

Run the example:
```bash
npm start
```

Or with watch mode:
```bash
npm run dev
```

## Example Code

The `index.js` file demonstrates:
- **SELECT query**: Fetching data from a table
- **INSERT query**: Adding data to a table

Both operations use the HTTP-based D1 database client.

## Features

- ✅ SELECT queries with LIMIT
- ✅ INSERT queries with bound parameters
- ✅ Error handling
- ✅ TypeScript-ready (uses @cloudflare/d1)

## Requirements

- Node.js 18+
- Running database API endpoint
- Valid authentication token
