"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const os_1 = __importDefault(require("os"));
const python_shell_1 = require("python-shell"); // Re-enable python-shell import
const path_1 = __importDefault(require("path"));
const validator_1 = require("../../services/validator"); // Use relative path
const db_1 = require("../../services/db"); // Use relative path
// Interfaces are now imported from shared/types, removed commented duplicates
// Handle the 'run-algorithm' request from the renderer process
// Returns the full AlgorithmResult object upon success
electron_1.ipcMain.handle('run-algorithm', async (_event, params) => {
    console.log('Main: Received run-algorithm request (Native modules TEMP disabled)');
    // --- 1. Validate Parameters ---
    try {
        (0, validator_1.validateAlgorithmParams)(params); // Use the comprehensive validator
        console.log('Main: Parameters validated successfully.');
    }
    catch (validationError) {
        console.error('Main: Parameter validation failed:', validationError);
        // Re-throw validation errors to be caught by the renderer's invoke call
        throw new Error(`Parameter validation failed: ${validationError.message}`);
    }
    // Destructure after validation confirms structure (including optional workers)
    const { m, n, k, j, s, t, samples, workers } = params; // Destructure t and workers
    // --- 2. Prepare Python Script Execution ---
    const isPackaged = electron_1.app.isPackaged; // Check if running in packaged app
    const scriptName = 'algorithm.py';
    // Calculate path relative to __dirname (dist/main/main/ipcHandlers)
    let fullScriptPath = path_1.default.join(__dirname, '..', '..', 'python', scriptName);
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
    // Determine the number of workers to use
    let numWorkers;
    if (workers !== undefined && workers > 0) {
        numWorkers = workers; // Use user-provided value if valid
        console.log(`Main: Using user-specified workers: ${numWorkers}`);
    }
    else {
        numWorkers = os_1.default.cpus().length; // Default to the number of logical CPU cores
        console.log(`Main: Defaulting to number of CPU cores for workers: ${numWorkers}`);
    }
    scriptArgs.push('--workers', String(numWorkers)); // Always add the workers argument
    // Removed the construction of fullScriptPath from here as it's done above
    const options = {
        mode: 'text', // Change mode to text to handle potential non-JSON output first
        pythonPath: 'python', // Ensure python is in PATH or provide full path
        // scriptPath: pythonScriptPath, // Remove scriptPath from options
        args: scriptArgs,
    };
    console.log(`Main: Preparing to execute Python script: ${options.pythonPath} ${fullScriptPath} with args: ${scriptArgs.join(' ')}`); // Log the full script path
    // --- Execute Python Script ---
    let resultData;
    try {
        console.log('Main: Executing PythonShell...'); // Updated log
        // 创建一个PythonShell实例，传递完整路径，而不是依赖 options.scriptPath
        const pyshell = new python_shell_1.PythonShell(fullScriptPath, options); // Use fullScriptPath
        // Note: Removed the 'message' listener here that was only sending progress.
        // We will process all messages after the script finishes.
        // 执行Python脚本并等待所有输出行
        const messages = await new Promise((resolve, reject) => {
            const collectedMessages = [];
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
        let foundResultData = null;
        let parseErrorOccurred = false;
        // Process all collected messages
        messages.forEach((message, index) => {
            try {
                const data = JSON.parse(message);
                // Check for Progress Update
                if (data && data.type === 'progress') {
                    const progressData = {
                        percent: data.percent,
                        message: data.message,
                        elapsed_time: data.elapsed_time
                    };
                    electron_1.BrowserWindow.getAllWindows().forEach(window => {
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
                        foundResultData = data; // Store it, overwrite previous potential results
                    }
                    else {
                        console.warn(`Main: Found JSON with 'combos' but missing other expected fields at index ${index}:`, data);
                    }
                }
                // Handle other potential valid JSON messages if necessary
                // else {
                //    console.log(`Main: Parsed other JSON at index ${index}:`, data);
                // }
            }
            catch (e) {
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
        }
        else {
            // If no result JSON was found after checking all messages
            console.error('Main: Failed to find valid final result JSON in Python script output.');
            console.error('Main: Full Python stdout was:\n', messages.join('\n')); // Log the full output for debugging
            throw new Error('Python script finished, but did not provide recognizable final result JSON output.');
        }
    }
    catch (error) { // Catch block for the outer try (Python execution)
        console.error('Main: Error executing Python script:', error);
        // Enhance error message with stderr if available
        let errorMessage = `Algorithm execution failed: ${error.message || error}`;
        if (error.stderr) {
            errorMessage += `\nPython stderr: ${error.stderr}`;
        }
        throw new Error(errorMessage);
    }
    // End of Python Execution Block
    // --- 3. Save Results to Database ---
    // This block only runs if the try block above completed successfully AND assigned resultData
    try {
        console.log("Main: Saving results to database...");
        // Save to DB (returns filename, but we ignore it here as we return the full result)
        await (0, db_1.saveResultToDb)(resultData); // Use await, but don't assign the filename
        console.log(`Main: Results saved successfully.`); // Simplified log message
        // Add filename to result if needed by UI later, though saveResultToDb doesn't return it directly anymore
        // resultData.filename = savedFilename; // Example if filename needed
        return resultData; // Return the full result object to the renderer
    }
    catch (dbError) {
        console.error("Main: Failed to save results to database:", dbError);
        throw new Error(`Failed to save results: ${dbError.message}`);
    }
});
// Ensure this file is imported in main/index.ts to register the handler
console.log('Main: Run algorithm IPC handler registered.');
