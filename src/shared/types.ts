// Shared types used across main, renderer, and potentially services

// Parameters sent from Renderer to Main for algorithm execution
export interface AlgorithmParams {
  m: number;
  n: number;
  k: number;
  j: number;
  s: number;
  t: number;
  samples: number[]; // Array of selected sample numbers
  workers?: number; // Optional: Number of workers to use
}

// Result structure returned from Main (via Python script) to Renderer
export interface AlgorithmResult {
  m: number;
  n: number;
  k: number;
  j: number;
  s: number;
  t: number;
  samples: number[]; // The actual samples used (sorted)
  combos: number[][]; // List of resulting k-combinations (tuples from Python become arrays)
  execution_time?: number; // Optional: Time taken by the Python function
  workers?: number; // Optional: Workers actually used by Python
}

// Structure for content read from a DB file, sent from Main to Renderer
// IMPORTANT: DbFileContent should represent STORED data, so it likely DOES NOT
// include transient runtime info like execution_time or workers requested/used.
// We should inherit from a *subset* of AlgorithmParams if needed, or define explicitly.
// Let's define explicitly what's expected from a saved DB file content.
export interface DbFileContent {
  m: number;
  n: number;
  k: number;
  j: number;
  s: number;
  t: number; // 't' should be part of the saved parameters
  samples: number[];
  combos: number[][];
  // Could add timestamp or runId if stored/needed, e.g.:
  // id?: number; // If the ID is useful in the UI
  // created?: string; // If timestamp is useful
  // runId?: string;
}

// Structure representing a row in the *Python* SQLite database (used by save_result)
// This does NOT include execution_time or workers as those are not saved in the 'params' JSON.
// Note: This DbRow interface might be redundant if only used conceptually in Python.
// If used in TypeScript (e.g., in db-handler for reading), it needs alignment.
// Let's assume it's primarily for Python's context or needs adjustment if read by TS.

// Let's re-evaluate DbRow if db-handler.ts actually reads using this structure.
// Based on db-handler.ts (which is currently using dummy data), this interface isn't directly used there.
// Let's comment it out for now to avoid confusion, as the actual schema is defined in algorithm.py's _init_db.
// export interface DbRow {
//   param_m: number;
//   param_n: number;
//   param_k: number;
//   param_j: number;
//   param_s: number;
//   param_t: number; // Added t
//   samples_json: string;
//   combo_json: string;
// }

// 定义进度更新的接口
export interface ProgressUpdate {
  percent: number;  // 进度百分比 (0-100)
  message: string;  // 进度描述信息
  elapsed_time?: number; // 运行时间（秒）
}

// Type for the API exposed via preload script (for type safety in Renderer)
// We define it here to avoid circular dependencies if preload imports types from here
export interface ExposedElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, listener: (...args: any[]) => void) => () => void;

  // Define specific methods matching allowedInvokeChannels in preload.ts
  // runAlgorithm now returns the full AlgorithmResult, including time/workers
  runAlgorithm: (params: AlgorithmParams) => Promise<AlgorithmResult>;
  listDbFiles: () => Promise<string[]>;
  deleteDbFile: (filename: string) => Promise<void>;
  // getDbContent returns the DbFileContent type, which intentionally omits runtime info
  getDbContent: (filename: string) => Promise<DbFileContent>;

  // 添加监听算法进度更新的方法
  onAlgorithmProgress: (callback: (progress: ProgressUpdate) => void) => () => void;

  // Add specific 'on' methods if needed, matching allowedReceiveChannels
  // onUpdateAvailable: (callback: () => void) => () => void;
}

// Enhance the Window interface to include the exposed API
declare global {
  interface Window {
    electronAPI: ExposedElectronAPI;
  }
}
