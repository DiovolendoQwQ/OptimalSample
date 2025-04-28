"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveResultToDb = saveResultToDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises")); // Keep async fs for generateFilename checks
const fs_1 = __importDefault(require("fs")); // Use sync fs for directory creation
const electron_1 = require("electron");
// Define the target directory within the Electron userData path
const dbDir = path_1.default.join(electron_1.app.getPath('userData'), 'databases'); // Use userData path
/**
 * Ensures the directory for storing databases exists in the userData path.
 * Uses synchronous mkdir before database operations within userData.
 */
function ensureDbDirectorySync() {
    try {
        // Use synchronous mkdir before database operations
        if (!fs_1.default.existsSync(dbDir)) {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
            console.log(`DB Service: Database directory created at: ${dbDir}`);
        }
        else {
            console.log(`DB Service: Database directory already exists at: ${dbDir}`);
        }
    }
    catch (error) {
        console.error('DB Service: Error creating database directory in userData:', error);
        // Throw a specific error or handle appropriately
        throw new Error('Failed to initialize database storage directory in userData.');
    }
}
// Removed immediate async call. ensureDbDirectorySync will be called in saveResultToDb.
/**
 * Generates a unique filename based on parameters and current run count within the userData directory.
 * Format: m-n-k-j-s-run-x-count.db
 *
 * @param params - The algorithm parameters (m, n, k, j, s).
 * @param resultCount - The number of combinations found.
 * @returns The generated filename string.
 */
async function generateFilename(params, resultCount) {
    const baseName = `${params.m}-${params.n}-${params.k}-${params.j}-${params.s}`;
    let runIndex = 1;
    let filename = '';
    // Find the next available run index for this parameter set in the userData directory
    while (true) {
        filename = `${baseName}-run-${runIndex}-${resultCount}.db`;
        const filePath = path_1.default.join(dbDir, filename); // dbDir now points to userData/databases
        try {
            await promises_1.default.access(filePath); // Use async fsPromises here
            runIndex++; // If it exists, increment index and try again
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                break; // File doesn't exist, this index is free
            }
            else {
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
async function saveResultToDb(resultData) {
    // Ensure the target directory in userData exists before proceeding
    ensureDbDirectorySync(); // Call the synchronous directory check/creation function
    // Destructure all parameters including 't', execution_time, workers if needed by generateFilename or DB
    const { m, n, k, j, s, t, samples, combos } = resultData; // execution_time, workers removed if not used below
    // Adjust generateFilename call if its parameter type changed
    const filename = await generateFilename({ m, n, k, j, s, t }, combos.length);
    const filePath = path_1.default.join(dbDir, filename); // dbDir now points to userData/databases
    let db = null;
    try {
        console.log(`DB Service: Creating and opening database: ${filePath}`);
        db = new better_sqlite3_1.default(filePath); // Enable database creation
        // --- Create Table Structure ---
        // Note: Removed duplicate param columns
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
        console.log("DB Service: Table 'results' ensured (with t column).");
        // --- Insert Data ---
        const samplesJson = JSON.stringify(samples);
        // Use a transaction for efficiency when inserting multiple rows
        // Note: The prepared statement should match the columns, including 't'
        const insertStmt = db.prepare(`
      INSERT INTO results (param_m, param_n, param_k, param_j, param_s, param_t, samples_json, combo_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const insertMany = db.transaction((items) => {
            for (const combo of items) {
                const comboJson = JSON.stringify(combo);
                // Execute with 't' value
                insertStmt.run(m, n, k, j, s, t, samplesJson, comboJson);
            }
        });
        console.log(`DB Service: Inserting ${combos.length} combinations...`);
        insertMany(combos); // Execute the transaction
        console.log("DB Service: Insertion complete.");
        // Removed fake delay: await new Promise(resolve => setTimeout(resolve, 50));
        return filename; // Return the actual filename where data was saved
    }
    catch (error) {
        console.error(`DB Service: Error during mocked save to ${filePath}:`, error);
        // Real error handling
        throw new Error(`Failed to save results to database: ${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
        // Ensure DB is closed if it was opened
        if (db && db.open) {
            db.close();
            console.log(`DB Service: Closed database ${filePath}`);
        }
    }
}
// Note: Reading and deleting logic is primarily handled in db-handler.ts
// This service focuses on the SAVING aspect, including filename generation and data insertion.
