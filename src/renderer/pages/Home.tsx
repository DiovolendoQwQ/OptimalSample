// Corrected imports - only one set needed
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ParamForm from '../components/ParamForm'; // Import the form component
import { AlgorithmParams, AlgorithmResult, ProgressUpdate } from '@/shared/types'; // Import AlgorithmResult and ProgressUpdate

// Helper function to calculate combinations (nCr)
function combinations(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  // Take advantage of symmetry C(n, k) == C(n, n-k)
  if (k > n / 2) {
    k = n - k;
  }
  let res = 1;
  for (let i = 1; i <= k; ++i) {
    // Use Math.round for potentially safer multiplication order with large numbers
    res = Math.round((res * (n - i + 1)) / i);
    // Check for potential overflow if numbers get very large
    if (!Number.isSafeInteger(res)) {
      console.warn("Binomial coefficient calculation might exceed safe integer limit for n=", n, "k=", k);
      return Number.MAX_SAFE_INTEGER; // Return a large number as an indicator
    }
  }
  return res;
}

const HomePage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null); // For displaying feedback
  // Keep progress state primarily for the message, percentage will be simulated
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [simulatedPercent, setSimulatedPercent] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to store interval ID
  const navigate = useNavigate(); // Hook for navigation

  // Stop the simulation interval
  const stopSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 监听算法进度更新 - Only update the message now
  useEffect(() => {
    // 确保electronAPI存在
    if (!window.electronAPI) return;

    // 注册进度更新监听器
    const unsubscribe = window.electronAPI.onAlgorithmProgress((progressData: ProgressUpdate) => {
      // Add console log in the Renderer process to confirm message arrival
      console.log('[Renderer] Received algorithm-progress:', progressData);
      // Only update the message, not the percentage directly
      setProgressMessage(progressData.message || '');
    });

    // 组件卸载时取消监听，并清除 interval
    return () => {
      unsubscribe();
      stopSimulation(); // Clean up interval on unmount
    };
  }, [stopSimulation]); // Added stopSimulation dependency

  // Callback function passed to ParamForm
  const handleFormSubmit = useCallback(async (params: AlgorithmParams) => {
    setIsSubmitting(true);
    setSubmissionStatus(null); // Clear previous status
    setProgressMessage('Initializing calculation...'); // Set initial message
    setSimulatedPercent(0); // Reset simulated percentage
    stopSimulation(); // Clear any existing interval
    console.log('HomePage: Submitting params:', params);

    // --- Dynamic Simulation Duration ---
    const numJSubsets = combinations(params.n, params.j);
    let simulationDuration = 5000; // Default 5 seconds
    console.log(`Estimated j-subsets: ${numJSubsets}`); // Log estimated count

    if (numJSubsets > 10000) {
      simulationDuration = 15000; // 15 seconds for large complexity
      console.log("Setting simulation duration to long (15s)");
    } else if (numJSubsets > 1000) {
      simulationDuration = 8000; // 8 seconds for medium complexity
      console.log("Setting simulation duration to medium (8s)");
    } else {
      console.log("Setting simulation duration to short (5s)"); // Keep default for small
    }
    // --- End Dynamic Simulation Duration ---

    const updatesPerSecond = 10;
    const increment = 90 / (simulationDuration / 1000 * updatesPerSecond); // Calculate increment based on dynamic duration

    intervalRef.current = setInterval(() => {
      setSimulatedPercent(prev => {
        const next = prev + increment;
        if (next >= 90) {
          stopSimulation(); // Stop near 90%
          return 90;
        }
        return next;
      });
    }, 1000 / updatesPerSecond);


    try {
      // Access the exposed API from the preload script
      if (window.electronAPI) {
        // --- Call the main process to run the algorithm ---
        const result: AlgorithmResult = await window.electronAPI.invoke('run-algorithm', params);

        // --- Success ---
        stopSimulation(); // Ensure simulation stops
        setSimulatedPercent(100); // Set to 100% on success
        setProgressMessage('Calculation complete!'); // Final message
        const execTime = result.execution_time ?? 'N/A';
        const workersUsed = result.workers ?? 'N/A';
        console.log(`HomePage: Algorithm finished successfully. Execution time: ${execTime}s, Workers: ${workersUsed}`);
        setSubmissionStatus(`Success! Completed in ${execTime}s using ${workersUsed} worker(s).`);

        // Optional navigation could go here
        // navigate('/db');

        // Clear status after a delay
        setTimeout(() => {
          setSubmissionStatus(null);
          // setProgressMessage(''); // Clear message if needed - REMOVED setProgress(null)
        }, 5000);

      } else {
        console.error("HomePage: Electron API not found on window object.");
        throw new Error("Electron API is not available. Preload script might have failed.");
      }
    } catch (error: any) {
      console.error("HomePage: Error during algorithm execution or saving:", error);
      // Display error message received from main process or form
      setSubmissionStatus(`Error: ${error.message || 'An unknown error occurred.'}`);
      // Keep error message displayed until next submission attempt
    } finally {
      setIsSubmitting(false); // Re-enable form
    }
  }, [navigate]); // Added navigate to dependency array if used

  return (
    <div>
      <h2>Optimal Samples Selection - Input Parameters</h2>
      <p>
        Fill in the parameters below or use "Random Select" for the samples,
        then click "Generate Optimal Groups".
      </p>
      <ParamForm onSubmit={handleFormSubmit} isSubmitting={isSubmitting} />

      {/* Display Submission Status/Feedback */}
      {submissionStatus && (
        <div style={{
          marginTop: '15px', padding: '10px', border: `1px solid ${submissionStatus.startsWith('Error') ? 'red' : 'green'}`, borderRadius: '4px', backgroundColor: submissionStatus.startsWith('Error') ? '#ffebee' : '#e8f5e9'
        }}>
          <strong>Status:</strong> {submissionStatus}
        </div>
      )}

      {/* 显示进度条 - Use isSubmitting to control visibility */}
      {isSubmitting && ( // Show progress UI only when submitting
        <div style={{ marginTop: '15px', padding: '10px', border: '1px solid #2196f3', borderRadius: '4px', backgroundColor: '#e3f2fd' }}>
          <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>计算进度:</strong> {progressMessage} {/* Use progressMessage */}
            </div>
            {/* Removed elapsed_time display as it came from the old progress state */}
          </div>
          <div style={{ width: '100%', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                height: '20px',
                width: `${simulatedPercent}%`, // Use simulated percentage
                backgroundColor: '#2196f3',
                borderRadius: '4px',
                transition: 'width 0.3s ease-in-out',
                display: 'flex', // Keep flex for centering text
                alignItems: 'center', // Keep flex for centering text
                justifyContent: 'center', // Keep flex for centering text
                color: simulatedPercent > 30 ? 'white' : 'black', // Adjust visibility based on simulated percent
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              {Math.round(simulatedPercent)}% {/* Display rounded simulated percentage */}
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default HomePage;
