import { ipcMain, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
// import Database from 'better-sqlite3'; // TEMP: Disable better-sqlite3 import AGAIN
import { DbFileContent } from '../../shared/types'; // Use relative path

// Define the structure for database file content returned to renderer
// interface DbFileContent { // Now imported
//   m: number;
//   n: number;
//   k: number;
//   j: number;
//   s: number;
//   samples: number[];
//   combos: number[][];
//   // Add other relevant metadata if stored (e.g., timestamp)
// }
// Removed duplicate local interface definition for DbFileContent

// Define the structure for the data stored in the SQLite DB
interface DbRow {
  id: number; // Add the ID field from the database table
  param_m: number;
  param_n: number;
  param_k: number;
  param_j: number;
  param_s: number;
  samples_json: string; // Store samples array as JSON string
  combo_json: string;   // Store a single combo as JSON string
}


const dbDir = path.join(app.getPath('userData'), 'databases'); // Store DBs in userData

// Ensure database directory exists
async function ensureDbDirectory() {
  try {
    await fs.mkdir(dbDir, { recursive: true });
    console.log(`Database directory ensured at: ${dbDir}`);
  } catch (error) {
    console.error('Error creating database directory:', error);
    // Decide how to handle this - maybe throw, maybe log and continue if non-critical
  }
}

// Call ensureDbDirectory on startup
ensureDbDirectory();

// --- IPC Handlers ---

// Handle 'list-db-files' request
ipcMain.handle('list-db-files', async (): Promise<string[]> => {
  console.log('Received list-db-files request.');
  try {
    const files = await fs.readdir(dbDir);
    // Filter for files matching the expected naming convention (e.g., ending in .db)
    const dbFiles = files.filter(file => file.endsWith('.db') && /^\d+-\d+-\d+-\d+-\d+-run-\d+-\d+\.db$/.test(file));
    console.log(`Found ${dbFiles.length} DB files.`);
    return dbFiles;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('Database directory does not exist yet, returning empty list.');
      return []; // Directory doesn't exist, so no files
    }
    console.error('Error listing DB files:', error);
    throw new Error('Failed to list database files.'); // Propagate error to renderer
  }
});

// Handle 'delete-db-file' request
ipcMain.handle('delete-db-file', async (_event, filename: string): Promise<void> => {
  console.log(`Received delete-db-file request for: ${filename}`);
  if (!filename || typeof filename !== 'string' || !filename.endsWith('.db')) {
    throw new Error('Invalid filename provided for deletion.');
  }
  // Basic check to prevent directory traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Invalid characters in filename.');
  }

  const filePath = path.join(dbDir, filename);

  try {
    await fs.unlink(filePath);
    console.log(`Successfully deleted file: ${filePath}`);
  } catch (error: any) {
    console.error(`Error deleting file ${filePath}:`, error);
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filename}`);
    }
    throw new Error(`Failed to delete file: ${filename}`);
  }
});

// Handle 'get-db-content' request
ipcMain.handle('get-db-content', async (_event, filename: string): Promise<DbFileContent> => {
  console.log(`Received get-db-content request for: ${filename} (Native modules TEMP disabled)`);
  if (!filename || typeof filename !== 'string' || !filename.endsWith('.db')) {
    throw new Error('Invalid filename provided for reading.');
  }
  // Basic check to prevent directory traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Invalid characters in filename.');
  }

  const filePath = path.join(dbDir, filename);
  // let db: Database.Database | null = null; // TEMP: Keep disabled

  try {
    // Check if file exists first
    await fs.access(filePath); // Throws if file doesn't exist
    console.log(`DB Handler: Opening database: ${filePath} in read-only mode (TEMP DISABLED).`);
    // db = new Database(filePath, { readonly: true }); // TEMP: Keep disabled

    console.log(`DB Handler: Querying results from ${filename}... (TEMP DISABLED)`);
    // const rows = db.prepare('SELECT * FROM results').all() as DbRow[]; // TEMP: Keep disabled

    // --- Simulate result since DB is disabled ---
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
    const dummyParams = { m: 45, n: 9, k: 6, j: 4, s: 4, t: 1 }; // Example params, added t: 1
    const dummySamples = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const dummyCombos = [[11, 12, 13, 14, 15, 16], [21, 22, 23, 24, 25, 26]];
    // The result type DbFileContent now correctly includes 't' inherited via dummyParams
    const result: DbFileContent = { ...dummyParams, samples: dummySamples, combos: dummyCombos };
    console.log(`DB Handler: Successfully read DUMMY combos from ${filename}`);
    return result;
    // --- End of Simulation ---

    /* // Original DB reading logic (kept commented):
    if (!rows || rows.length === 0) {
      // Handle case where DB is empty or table doesn't exist properly
      console.warn(`DB Handler: No rows found in results table for ${filename}`);
      // Return default structure with empty combos, maybe infer params from filename if needed?
      // For simplicity, throw an error or return a specific structure indicating emptiness.
      // Let's try to extract params from the first row if it exists, else error.
      throw new Error('Database file is empty or contains no results.');
    }

    // Extract parameters and samples from the first row (assuming they are consistent)
    const firstRow = rows[0];
    const params = {
      m: firstRow.param_m,
      n: firstRow.param_n,
      k: firstRow.param_k,
      j: firstRow.param_j,
      s: firstRow.param_s,
    };
    let samples: number[] = [];
    try {
      samples = JSON.parse(firstRow.samples_json);
      if (!Array.isArray(samples)) throw new Error('Parsed samples_json is not an array');
    } catch (e) {
      console.error(`DB Handler: Error parsing samples_json from ${filename}`, e);
      throw new Error('Failed to parse samples data from database.');
    }

    // Extract all combos
    const combos: number[][] = [];
    for (const row of rows) {
      try {
        const combo = JSON.parse(row.combo_json);
        if (!Array.isArray(combo)) throw new Error('Parsed combo_json is not an array');
        combos.push(combo.map(Number)); // Ensure numbers are numeric
      } catch (e) {
        console.error(`DB Handler: Error parsing combo_json from row ${row.id} in ${filename}`, e);
        // Decide whether to skip this row or fail entirely
        throw new Error('Failed to parse combination data from database.');
      }
    }
    */ // End of original DB reading logic

  } catch (error: any) {
    console.error(`DB Handler: Error reading content (or dummy logic) for file ${filePath}:`, error);
    // No need to close DB as it wasn't opened
    // if (db && db.open) {
    //   try { db.close(); } catch (closeErr) { /* Ignore */ }
    // }
    if (error.code === 'ENOENT') {
      throw new Error(`Database file not found: ${filename}`);
    } else if (error.message.includes('SQLITE_ERROR')) {
      throw new Error(`Database structure error in ${filename}: ${error.message}`);
    }
    throw new Error(`Failed to get content for file: ${filename}`);
  }
});


console.log('Database IPC handlers registered.');
