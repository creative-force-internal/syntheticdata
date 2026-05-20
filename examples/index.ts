import { D1Database } from '@cloudflare/d1';

interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

// Initialize database client with HTTP fetch
const db = new D1Database({
  fetch: (path: string, init?: FetchInit) =>
    fetch(`http://localhost:3001/db/fxbzPZWubqvnk7nLGuaqZ${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: 'Bearer <your-key>',
      },
    }),
});

async function runExample(): Promise<void> {
  try {
    console.log('📦 Connected to database...\n');

    // Example 1: SELECT query
    console.log('1️⃣ Executing SELECT query...');
    const selectResult = await db.prepare('SELECT * FROM "table" LIMIT 100').all();
    console.log('Results:', selectResult.results);
    console.log('');

    // Example 2: INSERT query
    console.log('2️⃣ Executing INSERT query...');
    const insertResult = await db
      .prepare('INSERT INTO "table" (col) VALUES (?)')
      .bind('value')
      .run();
    console.log('Insert successful:', insertResult.success);
    console.log('');

    console.log('✅ All examples completed successfully!');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

runExample();
