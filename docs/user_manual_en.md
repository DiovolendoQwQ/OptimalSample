# Optimal Sample Selection System - User Manual

## 1. Introduction

Welcome to the Optimal Sample Selection System. This application is designed to solve a specific combinatorial optimization problem: given a set containing `m` total samples, select `n` initial samples, and then find a **minimum number** of groups (called k-combinations), each containing `k` samples. This collection of groups must satisfy specific coverage requirements.

The coverage requirement is defined for all subsets containing `j` samples (called j-subsets) selected from the `n` initial samples. For each j-subset, we require that its internal subsets containing `s` samples (called s-subsets) are "covered" by at least `t` (threshold) of the selected k-combinations. "Coverage" is defined as follows: a k-combination covers a j-subset (at the s-level) if and only if the j-subset has at least one s-subset that is also an s-subset of the k-combination.

This system provides a graphical user interface (GUI) allowing users to input parameters (m, n, k, j, s, t) and the initial sample list. It then calls a backend Python algorithm to compute the optimal (or near-optimal) set of k-combinations satisfying the conditions and saves the results to the **`database` folder within the project** for subsequent viewing, management, and export.

The software is developed based on the Electron framework, using React (built with Vite) for the user interface, and calls Python scripts to perform the core combinatorial optimization calculations.

## 2. Software Architecture & Technology Stack

### 2.1 Software Architecture

This application adopts a standard **Electron** architecture, combined with a **Python** backend for core algorithm processing, specifically divided into the following main parts:

*   **Main Process**:
    *   Launched and managed by Electron.
    *   Entry file: `src/main/index.ts` (compiled to `dist/main/main/index.js`).
    *   Responsibilities: Creating and managing application windows (`BrowserWindow`), handling native operating system events, coordinating renderer processes and backend services, managing all IPC (Inter-Process Communication) logic, **handling the creation, reading, deletion, and export of database files**.
    *   IPC handlers are located in the `src/main/ipcHandlers/` directory (e.g., `run-handler.ts`, `db-handler.ts`), responsible for responding to requests from the renderer process.
    *   Uses `app.isPackaged` to detect the runtime environment (development vs. packaged).
    *   Loads local HTML files using the `file://` protocol in the production environment (after packaging).
*   **Renderer Process**:
    *   Each Electron window runs an independent renderer process (Chromium environment).
    *   The user interface (UI) is built using **React** and **TypeScript**, with **Ant Design** as the UI library.
    *   Entry HTML: `src/renderer/index.html`.
    *   React application entry: `src/renderer/main.tsx`.
    *   Uses **Vite** as the development server and production build tool (`vite build`), outputting to `dist/renderer`.
*   **Preload Script**:
    *   Entry file: `src/preload.ts` (compiled to `dist/main/preload.js`).
    *   Runs before the web page loads in the renderer process, bridging the main and renderer processes.
    *   Uses `contextBridge` to securely expose main process IPC functions to the renderer process (e.g., `window.electronAPI.invoke(...)`), including a whitelist mechanism to limit callable channels.
*   **Core Algorithm Service (Python Backend)**:
    *   Algorithm implementation: `src/python/algorithm.py`.
    *   Uses Python to implement combination generation and optimization logic, relying on `ortools` and `numpy`.
    *   **No longer directly operates the database**, only responsible for computation and returning results to the main process.
    *   Called from the Node.js main process (`run-handler.ts`) via the `python-shell` library.
    *   In the packaged application, this script is located in the `resources/app.asar.unpacked/dist/main/python/` directory to allow access by external Python processes.
*   **Node.js Service Layer (Services)**:
    *   Located in the `src/services/` directory.
    *   `validator.ts`: Encapsulates parameter validation logic.
    *   `db.ts`: (If exists) May contain some auxiliary database functions, but the main database interaction logic has been moved to `ipcHandlers`.

### 2.2 Technology Stack

*   **Frameworks**: Electron, React
*   **Languages**: TypeScript, Python, JavaScript, HTML, CSS
*   **UI Library**: Ant Design (`antd`)
*   **Build Tools**: Vite (Renderer Process), TypeScript Compiler (`tsc`) (Main Process/Preload)
*   **Packaging Tool**: electron-builder
*   **Package Manager**: npm
*   **Database**: SQLite (operated via `better-sqlite3` in the main process)
*   **Excel Export**: `exceljs`
*   **Inter-Process Communication**: Electron IPC, `python-shell`
*   **Core Algorithm Libraries (Python)**: Google OR-Tools (CP-SAT), NumPy
*   **UI Routing**: `react-router-dom`
*   **Environment Detection**: `app.isPackaged` (Electron API)

### 2.3 Key Files & Directory Structure

*   `optimal-samples-app final/` (Project root directory)
    *   `package.json`: Project metadata, dependencies, scripts (`dev`, `build`, `package`, `rebuild`). Contains `electron-builder` packaging configuration (like `asarUnpack`).
    *   `tsconfig.json`: Base TypeScript configuration.
    *   `tsconfig.main.json`: TypeScript configuration for main process/preload scripts.
    *   `vite.config.ts`: Vite configuration (renderer process development & build).
    *   `database/`: **After running the algorithm, the generated SQLite database result files (.db) will be saved in this folder.**
    *   `dist/`: Contains compiled and built outputs.
        *   `main/`: Main process and preload script compilation output.
            *   `main/`: Contains compiled main process `.js` files (including `ipcHandlers`).
            *   `preload.js`: Compiled preload script.
            *   `python/`: Python scripts copied from `src/python`.
        *   `renderer/`: Production build output for the renderer process (by Vite).
    *   `docs/`: Project documentation (`user_manual.md`, `user_manual_en.md`).
    *   `node_modules/`: npm dependencies.
    *   `release/`: Packaged application installer files (generated by `npm run package`).
    *   `src/`: Source code.
        *   `main/`: Main process code.
        *   `preload.ts`: Preload script.
        *   `python/`: Python algorithm scripts (`algorithm.py`).
        *   `renderer/`: Renderer process (UI) code.
        *   `services/`: Node.js service layer (`validator.ts`).
        *   `shared/`: Shared code (`types.ts`).

## 3. Installation & Environment Requirements

### 3.1 Environment Requirements:

*   **Node.js and npm**: Download and install Node.js (LTS version recommended) from [https://nodejs.org/](https://nodejs.org/). npm will be installed alongside.
*   **Python**: Download and install Python (3.7 or higher recommended) from [https://www.python.org/](https://www.python.org/). **Ensure "Add Python to PATH" is checked during installation**, or manually configure the environment variables so that the `python` command can be run directly in the terminal.
*   **pip**: Python package installer, usually installed with Python.

### 3.2 Install Python Dependencies:

The core algorithm depends on `numpy` and `ortools`. Open a terminal or command prompt and run:

```bash
pip install numpy ortools psutil
```
*Note*:
*   `psutil` is used to automatically detect the number of CPU cores to optimize the `workers` parameter. If not installed, it will fall back to a default value.
*   Depending on your system configuration, you might need to use `pip3`.

### 3.3 Install Application Dependencies:

1.  Open a terminal and navigate to the project root directory (`optimal-samples-app final`).
2.  Run `npm install` to install Node.js dependencies (including `better-sqlite3`, `python-shell`, `exceljs`, etc.).
3.  This project uses native Node.js modules (`better-sqlite3`, `python-shell`) that require compilation. After dependency installation, you **must** rebuild them for the Electron environment. Run:
    ```bash
    npm run rebuild
    ```

## 4. Running the Application (Development Mode)

1.  Ensure your terminal is in the project root directory.
2.  Run `npm run dev`.

This command will perform cleanup, compilation, start the Vite development server, and launch the Electron application. After a short wait, the application window will appear, loading `http://localhost:5173`.

## 5. Using the Application

### 5.1 Home Page (Parameter Input):

*   **Input Parameters**:
    *   **M**: Total number of samples (range 45-54).
    *   **N**: Number of initial samples (range 7-25).
    *   **K**: Target group size (range 4-7).
    *   **J**: Coverage check subset size (s ≤ j ≤ k).
    *   **S**: Internal coverage subset size (3-7, and s ≤ j).
    *   **T**: Coverage threshold (1 ≤ t ≤ j, default 1). i.e., each j-subset must be covered by at least t selected k-combinations.
*   **Selected Samples**:
    *   Manually enter N comma-separated numbers (from 1 to M).
    *   Or click "Random Select Samples" to automatically generate N samples.
*   **Advanced Settings**:
    *   **Workers (CPU Cores)**: (Optional) Specify the number of CPU cores used by the solver. For the `s == j` case, it controls OR-Tools; for the `s < j` case, it controls the parallelism of Python multiprocessing evaluation. Defaults to the system core count or auto-detection.
    *   **Beam Width**: (Optional) Beam Search width for the `s < j` greedy algorithm, defaults to 1 (standard greedy).
*   Click the "Generate Optimal Groups" button to start the computation. The interface will display a progress bar and status information.
*   Upon successful completion, the results are automatically saved to the `database` folder in the project root, generating a unique `.db` filename (e.g., `45-7-6-5-5-1-run-1-6.db`), and a success message is shown. If it fails, an error message is displayed.

### 5.2 Manage Results Page:

*   This page lists all valid result database files (`.db`) in the project's `database` folder.
*   **Refresh List**: Rescans the `database` folder.
*   **View**: (Eye icon) Click to navigate to the "Result Details" page, displaying the detailed content of that file.
*   **Export to Excel**: (Excel icon) Click to prompt the user to choose a save location, then exports the parameters and combination data from that database file into an `.xlsx` file.
*   **Delete**: (Trash can icon) Click to show a confirmation dialog, then permanently deletes the selected result file upon confirmation.

### 5.3 Result Details Page:

*   This page displays the detailed information of a specific result file: run parameters, initial samples used, and the final list of selected k-combinations.

## 6. Building & Installing the Release Version

1.  Ensure all dependencies are correctly installed and rebuilt (`npm install`, `npm run rebuild`).
2.  Run the packaging command: `npm run package`.
3.  After packaging is complete, find the generated `.exe` installer (or corresponding file for other platforms) in the `release` folder within the project root.
4.  Run the installer file to install the application. Once installed, it can run independently without the development environment.

## 7. Algorithm Explanation

The core goal is to find the smallest set of K-element combinations that cover all specified subsets under the given conditions. The algorithm implementation is in the `src/python/algorithm.py` file, with the main logic in the `select_optimal_samples` function.

### 7.1 Problem Definition (Consistent with previous version)

Given parameters M, N, K, J, S, T and N initial samples `samples` (selected from 1..M):
1.  Generate all possible K-element combinations `k_combos` (selecting K elements from `samples`).
2.  Generate all possible J-element subsets `j_subsets` (selecting J elements from `samples`).
3.  **Goal**: Select a subset `selected_k_combos` from `k_combos` with the **minimum possible size**.
4.  **Constraint**: For **every** `j_subset`, it must be **covered (s-level)** by at least `T` k-combinations in `selected_k_combos`.
5.  **Coverage (s-level) Definition**: A `k_combo` covers a `j_subset` (at the s-level) if and only if the `j_subset` has at least one S-element subset that is also an S-element subset of the `k_combo`.

### 7.2 Algorithm Selection & Implementation

The algorithm employs different strategies based on the relationship between `s`, `j`, and `k` (`select_optimal_samples` function):

*   **Case 1: `s == j` AND `k == j` (Exact Solution - CP-SAT)**
    *   **Problem Transformation**: When `s=j=k`, the coverage definition simplifies: a `k_combo` covers a `j_subset` if and only if `k_combo == j_subset`. The problem transforms into the classic **Threshold Set Cover** problem.
    *   **K-Combination Pruning**: Before solving, if the `utils.combo_prune.unique_k_combos` utility is available, the original `k_combos` are pruned based on their s-subset signature to remove redundant combinations for covering j-subsets (where s=j=k), reducing the solver's burden.
    *   **Solver**: Uses the **CP-SAT constraint programming solver** from the **Google OR-Tools** library (`_threshold_set_cover` function) to find the exact solution.
    *   **Two-Round Solving Strategy**:
        1.  **Round 1**: Solves using a limited time budget (`TIME_ROUND_1`) and potentially sampled k-combinations and j-subsets (if their counts are too large).
        2.  **Round 2 (Optional)**: If the solution accuracy (`accuracy`) from Round 1 is below a target (`TARGET_ACCURACY`) and time permits, Round 2 is initiated. The solution from Round 1 is used as a warm start hint (`warm_start_hints`). More k-combinations (potentially sampled) are added, and the solver runs with the remaining time budget, aiming for a better or more precise solution.
    *   **Model & Constraints**:
        *   A boolean variable `x[i]` is created for each (potentially pruned or sampled) `k_combo[i]` (1=selected, 0=not selected).
        *   **Objective Function**: Minimize `sum(x[i])` (the number of selected k-combinations).
        *   **Constraints**: For each `j_subset`, find the indices `Needs` of all `k_combo`s that cover it, and add the constraint `sum(x[i] for i in Needs) >= t`. An optimized constraint building path exists for the special case `s=j=k, t=1`.
    *   **Solver Optimizations**:
        *   **Multi-core Parallelism**: Utilizes the `workers` parameter to specify the number of CPU cores for the CP-SAT solver.
        *   **Time Limit**: The `time_limit` parameter restricts the total runtime of the `select_optimal_samples` function, which is internally allocated to different stages of CP-SAT.
        *   **Symmetry Breaking**: Enabled by default (`x[i-1] >= x[i]`) to reduce the search space, but is **disabled** in the special case where `s=j=k` and `t=1`.
        *   **Warm Start**: In the `s=j=k` path, greedy warm-up is **not performed**. Round 1 of CP-SAT starts with zero hints. Round 2 uses the result from Round 1 as a warm start hint.

*   **Case 2: `s < j` OR (`s == j` BUT `k != j`) (Greedy Heuristic Algorithm + Optimization)**
    *   When the `s=j=k` condition is not met, finding an exact solution is often infeasible or inefficient. A **greedy heuristic algorithm** (`_greedy_cover_partial` function) is used to find an approximate solution.
    *   **Core Greedy Strategy (Sparse Cumulative Count)**:
        1.  **Precomputation**: Build an inverted index `j_to_k` mapping each j-subset to the list of k-combination indices that cover it.
        2.  Initialize an empty result set `selected_k_indices` and mark all j-subsets as unsatisfied.
        3.  **Iteration**: While there are still unsatisfied `j_subsets`:
            *   Calculate the score (`k_combo_scores`) for each **not yet selected** `k_combo`, representing how many currently unsatisfied `j_subsets` it would newly satisfy (efficiently computed using the `j_to_k` index).
            *   Select the `k_combo` with the highest score (greatest marginal utility).
            *   Add its index to `selected_k_indices` and update the satisfaction status of the j-subsets it covers.
        4.  Repeat until all `j_subsets` are satisfied or no `k_combo` can satisfy any more unsatisfied `j_subsets`.
    *   **Optimizations & Options**:
        *   **Single-point Greedy Elimination**: After the main greedy loop, if all j-subsets are satisfied, this optimization is performed. It iteratively checks each currently selected k-combination. If removing it still satisfies all coverage requirements, it is permanently removed. This process repeats until no more combinations can be removed.
        *   **Beam Search**: The `beam_width` parameter exists, but the Beam Search logic is not fully enabled in the current implementation; the actual behavior remains standard greedy (width 1).
        *   **Note**: Bitmask and 2-Opt optimizations are **no longer used**.
    *   **Note**: The greedy algorithm and its optimizations do not guarantee finding the globally optimal solution but aim to provide a high-quality approximate solution within a reasonable time.

### 7.3 Progress Reporting & Results

*   **Progress Reporting**: During algorithm execution, the `report_progress` function prints JSON-formatted progress information (including percentage, message, elapsed time) to standard output (`stdout`). The Electron main process captures this output and forwards it via IPC to the renderer process to update the UI.
*   **Result Return**: Upon completion, the `select_optimal_samples` function returns a Python dictionary containing detailed information, which is printed as a single JSON line to `stdout`. This dictionary includes:
    *   All input parameters (m, n, k, j, s, t)
    *   The list of initial samples used `samples`
    *   The list of computed (optimal or near-optimal) k-combinations `combos`
    *   Total algorithm execution time `execution_time` (seconds)
    *   The number of CPU worker threads actually used `workers`
    *   `greedy_indices`: (Only if s < j or s=j, k!=j) List of indices of k-combinations selected by the greedy algorithm.
    *   `accuracy`: (Mainly for s=j=k) The accuracy of the CP-SAT solution (best_bound / objective_value).
    *   `objective_value`: The objective function value of the final solution (i.e., the number of selected combinations).
    *   `best_bound`: The lower bound on the optimal solution found by CP-SAT.
    *   `theoretical_lower_bound`: Theoretically calculated lower bound for the number of solutions.
    *   `theoretical_upper_bound`: Theoretically calculated upper bound for the number of solutions (float).
    *   `theoretical_notes`: Notes or error messages from the theoretical bounds calculation.

## 8. Development Challenges & Solutions (Summary)

*   **Path Resolution**: Differences in paths between development and packaged environments resolved using `app.isPackaged` and `__dirname`/`app.getAppPath()` combined with `path.join`.
*   **`asar` Archive**: Used `asarUnpack` configuration to unpack Python scripts and adjusted path access in code to `.asar.unpacked`.
*   **Environment Detection**: Used `app.isPackaged` instead of `process.env.NODE_ENV` for reliable environment detection.
*   **Native Node.js Modules**: Used `electron-rebuild` (via `npm run rebuild`) to recompile modules for Electron's Node.js version.
*   **Database Path Unification**: Centralized database operations (including saving) in the main process, using consistent path logic pointing to the `database` folder within the project.

## 9. Troubleshooting

*   **Blank Application/Failure to Load**: Check Vite service, packaging configuration, `index.ts` loading logic, DevTools console.
*   **Python Script Errors**: Verify Python and dependency installation, path calculation in `run-handler.ts`, `asarUnpack` configuration, and path handling.
*   **Result File Not Found/Not Listed**:
    *   Check if the `database` folder exists in the project root.
    *   Verify the `dbDir` path logic in `db-handler.ts` and `run-handler.ts`.
    *   Confirm the regular expression in `list-db-files` within `db-handler.ts` matches the actual generated filename format.
*   **Database Errors**: Confirm file system permissions, ensure `better-sqlite3` is correctly compiled (`npm run rebuild`).
*   **Excel Export Failure**: Confirm `exceljs` is installed, the IPC channel is exposed (`preload.ts`), the main process handler logic is correct, and the target save location has write permissions.

## 10. Performance Notes & Benchmarking

### 10.1 Performance Tips

The core algorithm uses different strategies based on the relationship between `s`, `j`, and `k`, with the following performance characteristics:

*   **CP-SAT (`s=j` AND `k=j` case)**:
    *   This is an exact solver employing a two-round strategy to balance speed and precision.
    *   Performance benefits from K-combination pruning (`utils.combo_prune`).
    *   Symmetry-breaking constraints are enabled by default but disabled under the specific `t=1` condition.
    *   The `workers` parameter (CPU cores) impacts performance; the system defaults to auto-detection based on physical cores (*1.5), but users can override this via advanced settings.
*   **Greedy Heuristic (`s<j` OR `s=j, k!=j` case)**:
    *   This is an approximate algorithm using a **sparse cumulative count** method based on an inverted index for coverage checks and greedy selection, replacing the previous bitmask method.
    *   **Single-point greedy elimination** optimization helps further reduce the number of resulting combinations after the greedy phase, replacing the previous 2-Opt optimization.

### 10.2 Benchmark

The project includes a benchmark script (`bench/bench.py`) for evaluating algorithm performance under different parameters.

*   **Test Setup**: (Information from `docs/benchmark.md`) Benchmarking is typically performed under fixed parameters (e.g., `t=1`, `workers=4`, `time_limit=60s`), running multiple random trials (e.g., 20 times) for a specific range of parameter combinations to collect data.
*   **Recorded Metrics**: The tests record key metrics such as execution time (`execution_time`), solver time (`solver_time`, CP-SAT only), final number of combinations (`num_combos`), etc.
*   **Result Files**: Raw benchmark data before and after optimization are saved in `benchmark_results.csv` and `benchmark_results_optimized.csv` files in the project root, respectively. Detailed performance comparison analysis (like charts and textual descriptions) was originally planned for `docs/benchmark.md`, but that file has now been merged here and is planned for deletion.
*   **Preliminary Results (from README)**: Simple tests show that for specific parameter examples, CP-SAT (`s=j`) can be very fast (e.g., ~31ms), while the greedy algorithm (`s<j`) is relatively slower (e.g., ~614ms). Actual times will vary based on the problem scale, complexity, and hardware environment.

---
Hopefully, this updated documentation helps you better understand and use the system!
