import { ipcMain, app, dialog } from 'electron'; // Import dialog
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3'; // Re-enable better-sqlite3 import
import ExcelJS from 'exceljs'; // Import exceljs
// Import AlgorithmParams along with DbFileContent
import { DbFileContent, AlgorithmParams } from '../../shared/types';
import { Database as DB } from 'better-sqlite3'; // Import DB type for utility function
import { constants as fsConstants } from 'fs'; // Import constants for access check

// --- Utility Functions ---

/**
 * Safely checks if a table exists in the database.
 * @param db The better-sqlite3 database instance.
 * @param tableName The name of the table to check.
 * @returns True if the table exists, false otherwise.
 */
function safeTableExists(db: DB, tableName: string): boolean {
  try {
    const row = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name = ?
    `).get(tableName);
    return !!row;
  } catch (error) {
    console.error(`Error checking if table '${tableName}' exists:`, error);
    return false; // Assume table doesn't exist on error
  }
}

// Define the database directory path relative to the app's root path (Moved earlier)
// Determine the correct base path depending on packaging
const basePath = app.isPackaged
  ? path.join(app.getAppPath(), '..') // Go up one level from 'resources/app.asar' or 'resources/app'
  : path.join(__dirname, '..', '..', '..', '..'); // Go up from 'dist/main/main/ipcHandlers' to project root

const dbDir = path.join(basePath, 'database');
console.log(`DB Handler: Database directory configured to: ${dbDir} (isPackaged: ${app.isPackaged})`); // Log context

// Define path for the central metadata JSON file (Now uses declared dbDir)
const metadataFilePath = path.join(dbDir, 'metadata.json');


/**
 * Reads the central metadata JSON file.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
async function readMetadataFile(): Promise<Record<string, { executionTime?: number | string, createdAt: string }>> {
  try {
    await fs.access(metadataFilePath, fsConstants.F_OK); // Check if file exists using fsPromises alias 'fs'
    const data = await fs.readFile(metadataFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log('DB Handler: metadata.json not found, returning empty object.');
      return {}; // File doesn't exist, start fresh
    }
    console.error('DB Handler: Error reading or parsing metadata.json:', error);
    return {}; // Return empty on other errors (like invalid JSON)
  }
}

/**
 * Writes data to the central metadata JSON file. (Copied from db.ts for use here)
 */
async function writeMetadataFile(data: Record<string, any>): Promise<void> {
  try {
    await fs.writeFile(metadataFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('DB Handler: Error writing metadata.json:', error);
    // Decide how to handle write errors, maybe throw
  }
}

// --- Database File Content Structure ---
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
  param_t: number; // Add the t parameter field
  samples_json: string; // Store samples array as JSON string
  combo_json: string;   // Store a single combo as JSON string
}


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
ipcMain.handle('list-db-files', async (): Promise<Array<{ filename: string, mtime: Date, createdAt: Date, execution_time?: string | number }>> => {
  console.log('Received list-db-files request.');
  try {
    const files = await fs.readdir(dbDir);
    // Filter for files matching the expected naming convention (e.g., m-n-k-j-s-t-run-X-Y.db)
    const dbFileRegex = /^\d+-\d+-\d+-\d+-\d+-\d+-run-\d+-\d+\.db$/;
    const dbFiles = files.filter(file => file.endsWith('.db') && dbFileRegex.test(file));

    // Read the central metadata JSON file once
    const allMetadata = await readMetadataFile();

    // Get file stats and combine with metadata from JSON
    const filesWithStats = await Promise.all(
      dbFiles.map(async (filename) => {
        const stat = await fs.stat(path.join(dbDir, filename));
        const fileMetadata = allMetadata[filename]; // Get metadata for this specific file

        let createdAt: Date | null = null;
        if (fileMetadata?.createdAt) {
          try {
            createdAt = new Date(fileMetadata.createdAt);
          } catch (dateError) {
            console.error(`DB Handler: Error parsing createdAt date for ${filename}:`, dateError);
          }
        }

        // executionTime might be string or number, handle parsing like before
        let execution_time: string | number | undefined = undefined;
        if (fileMetadata?.executionTime !== undefined) {
          const etValue = fileMetadata.executionTime;
          if (typeof etValue === 'number') {
            execution_time = etValue; // Already a number
          } else if (typeof etValue === 'string') {
            const numValue = parseFloat(etValue);
            execution_time = isNaN(numValue) ? etValue : numValue; // Parse if string
          }
        }


        return {
          filename,
          mtime: stat.mtime,
          createdAt: createdAt || stat.mtime, // Fallback to mtime if createdAt not found in JSON
          execution_time // Use execution_time read from JSON (or undefined)
        };
      })
    );

    // Sort by mtime (newest first)
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    console.log(`Found ${filesWithStats.length} DB files, sorted by modification time.`);
    return filesWithStats;
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
    // 1. Delete the .db file
    await fs.unlink(filePath);
    console.log(`Successfully deleted file: ${filePath}`);

    // 2. Update the metadata.json file
    try {
      const allMetadata = await readMetadataFile();
      if (allMetadata[filename]) {
        delete allMetadata[filename]; // Remove the entry for the deleted file
        await writeMetadataFile(allMetadata); // Call the globally defined function
        console.log(`DB Handler: Removed metadata for ${filename} from metadata.json.`);
      } else {
        console.warn(`DB Handler: No metadata found for ${filename} in metadata.json during delete.`);
      }
    } catch (metaJsonError) {
      console.error(`DB Handler: Failed to update metadata.json after deleting ${filename}:`, metaJsonError);
      // Decide if this should throw an error back to the renderer
      // For now, just log it, as the primary file deletion succeeded.
    }

  } catch (error: any) {
    console.error(`Error deleting file ${filePath}:`, error); // Log the full error
    if (error.code === 'ENOENT') {
      // File already gone
      throw new Error(`File not found: ${filename}`);
    } else if (error.code === 'EPERM' || error.code === 'EBUSY') {
      // Permissions issue or file locked
      throw new Error(`Cannot delete file '${filename}'. It might be open in another program or the application lacks permissions.`);
    }
    // Generic error for other cases
    throw new Error(`Failed to delete file '${filename}'. Reason: ${error.message || 'Unknown error'}`);
  }
});


// Handle 'get-db-content' request
ipcMain.handle('get-db-content', async (_event, filename: string): Promise<DbFileContent> => {
  console.log(`Received get-db-content request for: ${filename}`);
  if (!filename || typeof filename !== 'string' || !filename.endsWith('.db')) {
    throw new Error('Invalid filename provided for reading.');
  }
  // Basic check to prevent directory traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Invalid characters in filename.');
  }

  const filePath = path.join(dbDir, filename);
  let db: Database.Database | null = null; // Enable DB variable

  try {
    // Check if file exists first
    await fs.access(filePath); // Throws if file doesn't exist
    console.log(`DB Handler: Opening database: ${filePath} in read-only mode.`);
    db = new Database(filePath, { readonly: true, fileMustExist: true }); // Open in read-only, require file to exist

    console.log(`DB Handler: Querying results from ${filename}...`);
    const rows = db.prepare('SELECT * FROM results ORDER BY id').all() as DbRow[]; // Get all rows, order by id for consistency

    // Original DB reading logic (Uncommented and slightly modified):
    if (!rows || rows.length === 0) {
      // Handle case where DB is empty or table doesn't exist properly
      console.warn(`DB Handler: No rows found in results table for ${filename}`);
      // It's possible a file exists but is empty or has wrong structure
      throw new Error(`Database file '${filename}' is empty or contains no valid results data.`);
    }

    // Extract parameters and samples from the first row (assuming they are consistent across rows)
    const firstRow = rows[0];
    const params = {
      m: firstRow.param_m,
      n: firstRow.param_n,
      k: firstRow.param_k,
      j: firstRow.param_j,
      s: firstRow.param_s,
      t: firstRow.param_t, // Add t parameter
    };
    let samples: number[] = [];
    try {
      samples = JSON.parse(firstRow.samples_json);
      if (!Array.isArray(samples) || !samples.every(n => typeof n === 'number')) {
        throw new Error('Parsed samples_json is not a valid array of numbers');
      }
    } catch (e) {
      console.error(`DB Handler: Error parsing samples_json from ${filename}:`, e);
      throw new Error(`Failed to parse samples data from database file '${filename}'.`);
    }

    // Extract all combos
    const combos: number[][] = [];
    for (const row of rows) {
      try {
        const combo = JSON.parse(row.combo_json);
        // Add more robust checking for combo structure
        if (!Array.isArray(combo) || !combo.every(n => typeof n === 'number')) {
          throw new Error(`Parsed combo_json from row ${row.id} is not a valid array of numbers`);
        }
        combos.push(combo); // No need to map(Number) if validation passes
      } catch (e) {
        console.error(`DB Handler: Error parsing combo_json from row ${row.id} in ${filename}:`, e);
        // Fail entirely if any combo is invalid
        throw new Error(`Failed to parse combination data from row ${row.id} in database file '${filename}'.`);
      }
    }
    // End of original DB reading logic (Now active)

    // Get metadata (created_at and execution_time)
    // Read metadata from JSON file instead of SQLite metadata table
    let createdAt: string | undefined = undefined;
    let execution_time: string | undefined = undefined;
    let paramsFromMeta: Partial<AlgorithmParams> = {}; // Store params read from metadata (if stored in JSON)

    try {
      const allMetadata = await readMetadataFile();
      const fileMetadata = allMetadata[filename];
      if (fileMetadata) {
        if (fileMetadata.createdAt) {
          createdAt = fileMetadata.createdAt; // Already a string
        }
        if (fileMetadata.executionTime !== undefined) {
          execution_time = String(fileMetadata.executionTime); // Ensure it's a string for DbFileContent
        }
        // If params were stored in JSON (they are not currently, but could be)
        // if (fileMetadata.params) { try { paramsFromMeta = JSON.parse(fileMetadata.params); } catch(e) {...} }
      } else {
        console.warn(`DB Handler: No metadata found for ${filename} in metadata.json during get-db-content.`);
      }
    } catch (e) {
      console.error(`DB Handler: Error reading metadata.json during get-db-content for ${filename}:`, e);
    }


    // Combine params from results table (fallback) and metadata table (preferred if available)
    // Note: DbFileContent type might need adjustment if params are solely from metadata now
    const finalParams = { ...params, ...paramsFromMeta };

    const result: DbFileContent = {
      ...finalParams, // Use combined params
      samples,
      combos,
      createdAt, // Will be undefined if metadata.json didn't exist or key wasn't found
      execution_time // Will be undefined if metadata.json didn't exist or key wasn't found
    };
    // Updated log message
    console.log(`DB Handler: Successfully read ${combos.length} combos from ${filename}. Metadata source: metadata.json`);
    return result;

  } catch (error: any) {
    console.error(`DB Handler: Error reading content for file ${filePath}:`, error);
    // Ensure DB is closed on error
    if (db && db.open) {
      try { db.close(); console.log(`DB Handler: Closed database ${filePath} after error.`); } catch (closeErr) { /* Ignore close error */ }
    }
    // Rethrow specific error messages
    if (error.code === 'ENOENT') {
      throw new Error(`Database file not found: ${filename}`);
    } else if (error.message?.includes('SQLITE_')) { // Check for SQLite specific errors
      throw new Error(`Database error in ${filename}: ${error.message}`);
    }
    // Rethrow other errors or provide a generic message
    throw new Error(error.message || `Failed to get content for file: ${filename}`);
  } finally {
    // Ensure DB is closed even if try block completed successfully
    if (db && db.open) {
      db.close();
      console.log(`DB Handler: Closed database ${filePath} after successful read.`);
    }
  }
});

// Handle 'export-db-to-excel' request
ipcMain.handle('export-db-to-excel', async (_event, filename: string): Promise<{ success: boolean; message: string; filePath?: string }> => {
  console.log(`Received export-db-to-excel request for: ${filename}`);
  if (!filename || typeof filename !== 'string' || !filename.endsWith('.db')) {
    throw new Error('Invalid filename provided for export.');
  }
  // Basic check to prevent directory traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Invalid characters in filename.');
  }

  const dbFilePath = path.join(dbDir, filename);
  let db: Database.Database | null = null;

  try {
    // 1. Read data from DB (similar to get-db-content)
    await fs.access(dbFilePath);
    db = new Database(dbFilePath, { readonly: true, fileMustExist: true });
    const rows = db.prepare('SELECT * FROM results ORDER BY id').all() as DbRow[];
    if (!rows || rows.length === 0) {
      throw new Error(`Database file '${filename}' is empty or contains no results.`);
    }

    // Extract params and samples from the first row
    const firstRow = rows[0];
    const params = {
      m: firstRow.param_m,
      n: firstRow.param_n,
      k: firstRow.param_k,
      j: firstRow.param_j,
      s: firstRow.param_s,
      t: firstRow.param_t,
    };
    const samples: number[] = JSON.parse(firstRow.samples_json);

    // Extract all combos
    const combos: number[][] = rows.map(row => JSON.parse(row.combo_json));
    db.close(); // Close DB after reading

    // 2. Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Optimal Samples App';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Results');

    // 3. Write Headers and Parameters
    sheet.addRow(['Parameter', 'Value']);
    sheet.addRow(['M', params.m]);
    sheet.addRow(['N', params.n]);
    sheet.addRow(['K', params.k]);
    sheet.addRow(['J', params.j]);
    sheet.addRow(['S', params.s]);
    sheet.addRow(['T', params.t]);
    sheet.addRow(['Samples', samples.join(', ')]);
    sheet.addRow([]); // Add a blank row for separation
    sheet.addRow(['Selected Combinations']); // Header for combos

    // Add combo headers (e.g., Sample 1, Sample 2, ...) dynamically based on k
    const comboHeaderRow = ['Combo ID'];
    for (let i = 1; i <= params.k; i++) {
      comboHeaderRow.push(`Sample ${i}`);
    }
    sheet.addRow(comboHeaderRow);


    // 4. Write Combinations
    combos.forEach((combo, index) => {
      sheet.addRow([index + 1, ...combo]); // Add combo ID and spread combo elements
    });

    // Auto-adjust column widths (optional but nice)
    sheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell!({ includeEmpty: true }, cell => {
        let cellLength = cell.value ? cell.value.toString().length : 0;
        if (cellLength > maxLength) {
          maxLength = cellLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2; // Min width 10, add padding
    });

    // 5. Prompt user for save location
    const defaultExcelFilename = `export-${filename.replace(/\.db$/, '.xlsx')}`;
    const saveDialogResult = await dialog.showSaveDialog({
      title: 'Export the results as an Excel file',
      defaultPath: path.join(app.getPath('documents'), defaultExcelFilename), // Suggest saving in Documents
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (saveDialogResult.canceled || !saveDialogResult.filePath) {
      console.log('Excel export cancelled by user.');
      return { success: false, message: 'Export canceled' };
    }

    const savePath = saveDialogResult.filePath;

    // 6. Write workbook to file
    await workbook.xlsx.writeFile(savePath);
    console.log(`Successfully exported data from ${filename} to ${savePath}`);
    return { success: true, message: `Successfully exported to ${savePath}`, filePath: savePath };

  } catch (error: any) {
    console.error(`Error exporting ${filename} to Excel:`, error);
    if (db && db.open) { try { db.close(); } catch (e) { } } // Ensure DB closed on error
    // Provide specific error messages
    if (error.code === 'ENOENT') {
      throw new Error(`Source database file not found: ${filename}`);
    } else if (error.message?.includes('SQLITE_')) {
      throw new Error(`An error occurred while reading the database ${filename}: ${error.message}`);
    } else if (error.message?.includes('EPERM') || error.message?.includes('EBUSY')) {
      throw new Error(`Cannot write to the Excel file，it may be open or you might not have sufficient permissions: ${error.path || error.message}`);
    }
    throw new Error(error.message || `Failed to export  ${filename} `);
  }
});


console.log('Database IPC handlers registered.');
