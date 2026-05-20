// Simple database client using HTTP fetch API
interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface QueryResult {
  results?: unknown[];
  success?: boolean;
  error?: string;
}

class DatabaseClient {
  private baseUrl: string;
  private dbId: string;
  private authToken: string;

  constructor(config: { baseUrl: string; dbId: string; authToken: string }) {
    this.baseUrl = config.baseUrl;
    this.dbId = config.dbId;
    this.authToken = config.authToken;
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const url = `${this.baseUrl}/db/${this.dbId}/query`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      throw new Error(`Database error: ${response.statusText}`);
    }

    return await response.json();
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const url = `${this.baseUrl}/db/${this.dbId}/execute`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      throw new Error(`Database error: ${response.statusText}`);
    }

    return await response.json();
  }
}

async function runExample(): Promise<void> {
  try {
    console.log('📦 Initializing database client...\n');

    const db = new DatabaseClient({
      baseUrl: 'http://localhost:3001',
      dbId: 'fxbzPZWubqvnk7nLGuaqZ',
      authToken: '<your-key>',
    });

    // Example 1: SELECT query
    console.log('1️⃣ Executing SELECT query...');
    try {
      const selectResult = await db.query('SELECT * FROM "table" LIMIT 100');
      console.log('Results:', selectResult);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log('⚠️ SELECT example failed (expected if table doesn\'t exist):', err);
    }
    console.log('');

    // Example 2: INSERT query
    console.log('2️⃣ Executing INSERT query...');
    try {
      const insertResult = await db.execute('INSERT INTO "table" (col) VALUES (?)', ['value']);
      console.log('Insert result:', insertResult);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log('⚠️ INSERT example failed (expected if table doesn\'t exist):', err);
    }
    console.log('');

    console.log('✅ Examples completed!');
    console.log('\n📝 Note: Replace <your-key> with your actual authentication token');
    console.log('         and update the dbId and table names as needed.');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

runExample();
