import { ipcMain, app, BrowserWindow } from 'electron';
import os from 'os';
import { Options as PythonShellOptions, PythonShell } from 'python-shell'; // Re-enable python-shell import
import path from 'path';
import fs from 'fs/promises'; // Import fs/promises
import Database from 'better-sqlite3'; // Import Database
import { AlgorithmParams, AlgorithmResult, ProgressUpdate } from '../../shared/types'; // Use relative path
import { validateAlgorithmParams } from '../../services/validator'; // Use relative path
import { saveResultToDb } from '../../services/db'; // Re-enable this import

// Remove local DbRow definition as it's no longer used directly in this file
// (The actual DB interaction is now handled by the db service)

// Interfaces are now imported from shared/types, removed commented duplicates

// Handle the 'run-algorithm' request from the renderer process
// Returns the full AlgorithmResult object upon success
ipcMain.handle('run-algorithm', async (_event, params: AlgorithmParams): Promise<AlgorithmResult> => { // Changed return type
  console.log('Main: Received run-algorithm request (Native modules TEMP disabled)');

  // --- 1. Validate Parameters ---
  try {
    validateAlgorithmParams(params); // Use the comprehensive validator
    console.log('Main: Parameters validated successfully.');
  } catch (validationError: any) {
    console.error('Main: Parameter validation failed:', validationError);
    // Re-throw validation errors to be caught by the renderer's invoke call
    throw new Error(`Parameter validation failed: ${validationError.message}`);
  }

  // Destructure after validation confirms structure (including optional workers and beamWidth)
  const { m, n, k, j, s, t, samples, workers, beamWidth } = params; // Destructure t, workers, beamWidth

  // --- 2. Prepare Python Script Execution ---
  const isPackaged = app.isPackaged; // Check if running in packaged app
  const scriptName = 'algorithm.py';
  // Calculate path relative to __dirname (dist/main/main/ipcHandlers)
  let fullScriptPath = path.join(__dirname, '..', '..', 'python', scriptName);
  console.log(`Main: __dirname: ${__dirname}`);
  console.log(`Main: Initial calculated script path: ${fullScriptPath}`);

  // If packaged and trying to access unpacked script, adjust the path
  if (isPackaged) {
    fullScriptPath = fullScriptPath.replace('app.asar', 'app.asar.unpacked');
    console.log(`Main: Adjusted path for unpacked script: ${fullScriptPath}`);
  }

  // Convert samples array to comma-separated string for CLI arg
  const samplesString = samples.map(String).join(',');

  // Prepare arguments for the Python script
  const scriptArgs = [
    '-m', String(m),
    '-n', String(n),
    '-k', String(k),
    '-j', String(j),
    '-s', String(s),
    '--samples', samplesString,
    '-t', String(t), // Use destructured t
  ];

  // Add beamWidth to args if provided and valid
  if (beamWidth !== undefined && beamWidth >= 1) {
    scriptArgs.push('--beam', String(beamWidth)) // Assuming python script uses --beam
    console.log(`Main: Using beamWidth: ${beamWidth}`);
  } else {
    console.log(`Main: Using default beamWidth (1)`);
  }


  // Determine the number of workers to use
  let numWorkers: number;
  if (workers !== undefined && workers > 0) {
    numWorkers = workers; // Use user-provided value if valid
    console.log(`Main: Using user-specified workers: ${numWorkers}`);
  } else {
    numWorkers = os.cpus().length; // Default to the number of logical CPU cores
    console.log(`Main: Defaulting to number of CPU cores for workers: ${numWorkers}`);
  }
  scriptArgs.push('--workers', String(numWorkers)); // Always add the workers argument

  // Removed the construction of fullScriptPath from here as it's done above

  const options: PythonShellOptions = {
    mode: 'text', // Change mode to text to handle potential non-JSON output first
    pythonPath: 'python', // Ensure python is in PATH or provide full path
    // scriptPath: pythonScriptPath, // Remove scriptPath from options
    args: scriptArgs,
  };

  console.log(`Main: Preparing to execute Python script: ${options.pythonPath} ${fullScriptPath} with args: ${scriptArgs.join(' ')}`); // Log the full script path

  // --- Execute Python Script ---
  let resultData: AlgorithmResult;
  try {
    console.log('Main: Executing PythonShell...'); // Updated log

    // 创建一个PythonShell实例，传递完整路径，而不是依赖 options.scriptPath
    const pyshell = new PythonShell(fullScriptPath, options); // Use fullScriptPath

    // Note: Removed the 'message' listener here that was only sending progress.
    // We will process all messages after the script finishes.

    // 执行Python脚本并等待所有输出行
    const messages = await new Promise<string[]>((resolve, reject) => {
      const collectedMessages: string[] = [];

      pyshell.on('message', (message) => {
        collectedMessages.push(message);
        // Optionally, log raw messages as they arrive for debugging
        // console.log(`DEBUG Raw message: ${message}`);
      });

      pyshell.on('error', (err) => {
        console.error("PythonShell Error Event:", err); // Log the specific error event
        reject(err);
      });

      pyshell.on('pythonError', (err) => {
        console.error("PythonShell PythonError Event:", err); // Log Python execution errors
        reject(err); // Reject the promise on Python script error
      });

      pyshell.on('close', () => {
        console.log('Main: PythonShell close event.');
        resolve(collectedMessages);
      });

      // It's generally good practice to end the input stream if not sending data
      // pyshell.end((err) => {
      //   if (err) reject(err);
      // });
    });

    console.log('Main: Python script finished. Processing messages...');

    let foundResultData: AlgorithmResult | null = null;
    let parseErrorOccurred = false;

    // Process all collected messages
    messages.forEach((message, index) => {
      try {
        const data = JSON.parse(message);

        // Check for Progress Update
        if (data && data.type === 'progress') {
          const progressData: ProgressUpdate = {
            percent: data.percent,
            message: data.message,
            elapsed_time: data.elapsed_time
          };
          BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
              window.webContents.send('algorithm-progress', progressData);
            }
          });
          console.log(`Main: Processed Progress: ${progressData.percent}% - ${progressData.message}`);
        }
        // Check for Final Result (assuming it contains a 'combos' array)
        else if (data && Array.isArray(data.combos)) {
          // Validate structure further if needed
          if (typeof data.m === 'number' && typeof data.n === 'number' && /* ... other fields */ typeof data.execution_time === 'number') {
            console.log(`Main: Found potential result JSON at message index ${index}.`);
            foundResultData = data as AlgorithmResult; // Store it, overwrite previous potential results
          } else {
            console.warn(`Main: Found JSON with 'combos' but missing other expected fields at index ${index}:`, data);
          }
        }
        // Handle other potential valid JSON messages if necessary
        // else {
        //    console.log(`Main: Parsed other JSON at index ${index}:`, data);
        // }

      } catch (e) {
        // Ignore lines that are not valid JSON (like debug prints, etc.)
        console.log(`Main: Ignoring non-JSON message at index ${index}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
        // Optionally track if *any* parse error happened, though ignoring is often fine
        // parseErrorOccurred = true;
      }
    });

    // After processing all messages, check if we found the final result
    if (foundResultData) {
      console.log('Main: Successfully identified final result JSON.');
      resultData = foundResultData; // Assign the found result
    } else {
      // If no result JSON was found after checking all messages
      console.error('Main: Failed to find valid final result JSON in Python script output.');
      console.error('Main: Full Python stdout was:\n', messages.join('\n')); // Log the full output for debugging
      throw new Error('Python script finished, but did not provide recognizable final result JSON output.');
    }
  } catch (error: any) { // Catch block for the outer try (Python execution)
    console.error('Main: Error executing Python script:', error);
    // Enhance error message with stderr if available
    let errorMessage = `Algorithm execution failed: ${error.message || error}`;
    if (error.stderr) {
      errorMessage += `\nPython stderr: ${error.stderr}`;
    }
    throw new Error(errorMessage);
  }
  // End of Python Execution Block

  // --- 3. Save Results using the DB Service ---
  try {
    console.log("Main: Calling saveResultToDb service...");
    // Pass the complete resultData (including execution_time) to the service
    const savedFilename = await saveResultToDb(resultData);
    console.log(`Main: Results saved successfully via DB service to ${savedFilename}.`);
    // Return the original resultData, potentially adding the filename if needed by frontend
    // The service handles writing metadata.json now.
    return { ...resultData, filename: savedFilename };
  } catch (saveError: any) {
    console.error("Main: Failed to save results using DB service:", saveError);
    // Rethrow the error to be caught by the renderer
    throw new Error(`Failed to save results: ${saveError.message}`);
  }
});

// Ensure this file is imported in main/index.ts to register the handler
console.log('Main: Run algorithm IPC handler registered.');
