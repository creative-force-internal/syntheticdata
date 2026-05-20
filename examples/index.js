// Simple database client using HTTP fetch API
class DatabaseClient {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.dbId = config.dbId;
    this.authToken = config.authToken;
  }

  async query(sql, params = []) {
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

  async execute(sql, params = []) {
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

async function runExample() {
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
      console.log('⚠️ SELECT example failed (expected if table doesn\'t exist):', e.message);
    }
    console.log('');

    // Example 2: INSERT query
    console.log('2️⃣ Executing INSERT query...');
    try {
      const insertResult = await db.execute('INSERT INTO "table" (col) VALUES (?)', ['value']);
      console.log('Insert result:', insertResult);
    } catch (e) {
      console.log('⚠️ INSERT example failed (expected if table doesn\'t exist):', e.message);
    }
    console.log('');

    console.log('✅ Examples completed!');
    console.log('\n📝 Note: Replace <your-key> with your actual authentication token');
    console.log('         and update the dbId and table names as needed.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runExample();
