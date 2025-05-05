import Database, { Database as DB } from 'better-sqlite3';
import path from 'path';
import fsPromises from 'fs/promises'; // Keep async fs for generateFilename checks
import fs from 'fs'; // Use sync fs for directory creation
import { app } from 'electron';
import { AlgorithmResult, AlgorithmParams } from '@/shared/types'; // Import AlgorithmParams
import { constants as fsConstants } from 'fs'; // Import constants for access check

// Define the database directory path relative to the app's root path
// Determine the correct base path depending on packaging (Consistent with db-handler.ts)
const basePath = app.isPackaged
  ? path.join(app.getAppPath(), '..') // Go up one level from 'resources/app.asar' or 'resources/app'
  : path.join(__dirname, '..', '..', '..'); // Go up from 'dist/main/services' to project root

const dbDir = path.join(basePath, 'database'); // Use project's database folder
console.log(`DB Service: Database directory configured to: ${dbDir} (isPackaged: ${app.isPackaged})`);


/**
 * Ensures the directory for storing databases exists.
 * Uses synchronous mkdir before database operations.
 */
function ensureDbDirectorySync(): void {
  try {
    // Use synchronous mkdir before database operations
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`DB Service: Database directory created at: ${dbDir}`);
    } else {
      // Directory already exists, no need to log every time? Or keep for confirmation.
      // console.log(`DB Service: Database directory already exists at: ${dbDir}`);
    }
  } catch (error) {
    console.error(`DB Service: Error creating database directory at ${dbDir}:`, error);
    // Throw a specific error or handle appropriately
    throw new Error('Failed to initialize database storage directory.');
  }
}

/**
 * Ensures the necessary table schema exists in the database.
 * @param db The better-sqlite3 database instance.
 */
function ensureSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        param_m INTEGER NOT NULL,
        param_n INTEGER NOT NULL,
        param_k INTEGER NOT NULL,
        param_j INTEGER NOT NULL,
        param_s INTEGER NOT NULL,
        param_t INTEGER NOT NULL, -- Add t parameter column
        samples_json TEXT NOT NULL, -- Store samples array as JSON string
        combo_json TEXT NOT NULL    -- Store a single combo as JSON string
    );
  `);
  // Remove metadata table creation from here, as it's handled by JSON now.
  console.log("DB Service: Schema (results) ensured.");
}

// Define path for the central metadata JSON file
const metadataFilePath = path.join(dbDir, 'metadata.json');

/**
 * Reads the central metadata JSON file.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
async function readMetadataFile(): Promise<Record<string, { executionTime?: number | string, createdAt: string }>> {
  try {
    await fsPromises.access(metadataFilePath, fsConstants.F_OK); // Check if file exists
    const data = await fsPromises.readFile(metadataFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('DB Service: metadata.json not found, returning empty object.');
      return {}; // File doesn't exist, start fresh
    }
    console.error('DB Service: Error reading or parsing metadata.json:', error);
    return {}; // Return empty on other errors (like invalid JSON)
  }
}

/**
 * Writes data to the central metadata JSON file.
 */
async function writeMetadataFile(data: Record<string, any>): Promise<void> {
  try {
    await fsPromises.writeFile(metadataFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('DB Service: Error writing metadata.json:', error);
    throw new Error(`Failed to write metadata file: ${error instanceof Error ? error.message : String(error)}`); // Re-throw error
  }
}


// Removed immediate async call. ensureDbDirectorySync will be called in saveResultToDb.

/**
 * Generates a unique filename based on parameters and current run count.
 * Format: m-n-k-j-s-t-run-x-count.db (Including 't')
 *
 * @param params - The algorithm parameters (m, n, k, j, s, t).
 * @param resultCount - The number of combinations found.
 * @returns The generated filename string.
 */
// Update function signature and baseName to include 't'
async function generateFilename(params: Omit<AlgorithmResult, 'combos' | 'samples' | 'execution_time' | 'workers'>, resultCount: number): Promise<string> {
  const baseName = `${params.m}-${params.n}-${params.k}-${params.j}-${params.s}-${params.t}`; // Include 't'
  let runIndex = 1;
  let filename = '';

  // Find the next available run index for this parameter set
  while (true) {
    filename = `${baseName}-run-${runIndex}-${resultCount}.db`; // Include 't' in filename
    const filePath = path.join(dbDir, filename);
    try {
      await fsPromises.access(filePath); // Use async fsPromises here
      runIndex++; // If it exists, increment index and try again
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        break; // File doesn't exist, this index is free
      } else {
        console.error(`DB Service: Error checking file existence for ${filename}:`, error);
        throw new Error('Failed to generate unique database filename.'); // Re-throw other errors
      }
    }
  }
  console.log(`DB Service: Generated unique filename: ${filename}`);
  return filename;
}


/**
 * Saves the algorithm results to a new SQLite database file.
 *
 * @param resultData - The complete result data from the algorithm.
 * @returns The filename where the data was saved.
 * @throws {Error} If saving fails.
 */
export async function saveResultToDb(resultData: AlgorithmResult): Promise<string> {
  // Ensure the target directory in userData exists before proceeding
  ensureDbDirectorySync(); // Call the synchronous directory check/creation function

  // Destructure all parameters including 't', execution_time, workers
  const { m, n, k, j, s, t, samples, combos, execution_time, workers } = resultData;
  // Adjust generateFilename call if its parameter type changed
  const filename = await generateFilename({ m, n, k, j, s, t }, combos.length);
  const filePath = path.join(dbDir, filename); // dbDir now points to userData/databases
  let db: DB | null = null;

  try {
    console.log(`DB Service: Creating and opening database: ${filePath}`);
    db = new Database(filePath); // Enable database creation

    // Ensure only results schema exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          param_m INTEGER NOT NULL,
          param_n INTEGER NOT NULL,
          param_k INTEGER NOT NULL,
          param_j INTEGER NOT NULL,
          param_s INTEGER NOT NULL,
          param_t INTEGER NOT NULL, -- Add t parameter column
          samples_json TEXT NOT NULL, -- Store samples array as JSON string
          combo_json TEXT NOT NULL    -- Store a single combo as JSON string
      );
    `);
    console.log("DB Service: Table 'results' ensured.");

    // --- Insert Results Data ---
    const samplesJson = JSON.stringify(samples);
    // Use a transaction for efficiency when inserting multiple rows
    // Note: The prepared statement should match the columns, including 't'
    const insertStmt = db.prepare(`
      INSERT INTO results (param_m, param_n, param_k, param_j, param_s, param_t, samples_json, combo_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items: number[][]) => {
      for (const combo of items) {
        const comboJson = JSON.stringify(combo);
        // Execute with 't' value
        insertStmt.run(m, n, k, j, s, t, samplesJson, comboJson);
      }
    });

    console.log(`DB Service: Inserting ${combos.length} combinations...`);
    insertMany(combos); // Execute the transaction
    console.log("DB Service: Results insertion complete.");

    // --- Update Central Metadata JSON ---
    console.log(`DB Service: Attempting to update metadata.json for ${filename}...`); // Added log
    try {
      const allMetadata = await readMetadataFile();
      console.log(`DB Service: Read existing metadata.json (or empty object).`); // Added log
      allMetadata[filename] = { // Use filename as the key
        executionTime: execution_time !== undefined ? Number(execution_time).toFixed(3) : undefined,
        createdAt: new Date().toISOString()
        // Add other simple metadata if needed, avoid storing large objects like params here
      };
      await writeMetadataFile(allMetadata);
      console.log(`DB Service: Successfully wrote updated metadata to metadata.json for ${filename}.`); // Added log
    } catch (metaJsonError) {
      console.error(`DB Service: Failed to update metadata.json for ${filename}:`, metaJsonError);
      // Decide if this should cause the overall save to fail
    }


    return filename; // Return the actual filename where data was saved

  } catch (error) {
    console.error(`DB Service: Error saving results to ${filePath}:`, error);
    // Real error handling
    throw new Error(`Failed to save results to database: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Ensure DB is closed if it was opened
    if (db && db.open) {
      db.close();
      console.log(`DB Service: Closed database ${filePath}`);
    }
  }
}

// Note: Reading and deleting logic is primarily handled in db-handler.ts
// This service focuses on the SAVING aspect, including filename generation and data insertion.
