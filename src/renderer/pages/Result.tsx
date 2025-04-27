import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom'; // Use useLocation for potential state passing
import { DbFileContent } from '@/shared/types';

// Helper to format combo array for display
const formatCombo = (combo: number[]) => combo.map(n => String(n).padStart(2, '0')).join(', ');

const ResultPage: React.FC = () => {
  const { filename: paramFilename } = useParams<{ filename?: string }>(); // Get filename from URL param if used
  const location = useLocation(); // Access location state if passed via navigation

  const [resultData, setResultData] = useState<DbFileContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayFilename, setDisplayFilename] = useState<string | null>(paramFilename || null);

  useEffect(() => {
    // Attempt to load data based on URL parameter or potentially passed state
    // For now, this component is mostly a placeholder as the 'Last Result' link
    // in App.tsx doesn't pass specific data yet.
    // We'll add logic to fetch data based on 'displayFilename' when the
    // DbManager page is implemented and can navigate here with a filename.

    // Load data if a filename is present
    if (displayFilename) {
      const fetchResult = async () => {
        setIsLoading(true);
        setError(null);
        setResultData(null); // Clear previous results
        try {
          if (window.electronAPI) {
            console.log(`ResultPage: Fetching content for ${displayFilename}`); // Added log
            const data: DbFileContent = await window.electronAPI.invoke('get-db-content', displayFilename); // Corrected IPC call and uncommented
            console.log(`ResultPage: Received data for ${displayFilename}`, data); // Added log
            setResultData(data);
          } else {
            throw new Error("Electron API not available.");
          }
        } catch (err: any) {
          console.error(`ResultPage: Error loading ${displayFilename}`, err); // Added log
          setError(`Failed to load result for ${displayFilename}: ${err.message}`);
        } finally {
          setIsLoading(false);
        }
      };
      fetchResult();
    } else {
      // If no filename, maybe load the most recent result? Or show message.
      setError("No specific result file selected to display.");
      setResultData(null); // Ensure no old data is shown
    }

  }, [displayFilename]); // Re-run effect if the filename changes

  return (
    <div>
      <h2>Result Details</h2>

      {isLoading && <p>Loading result data...</p>}

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {!isLoading && !error && !resultData && (
        <p>Select a result file from the 'Manage Results' page to view details.</p>
        // Or display the last known successful result if implemented
      )}

      {resultData && (
        <div>
          <h3>Parameters for: {displayFilename || 'Result'}</h3>
          <p>
            <strong>M:</strong> {resultData.m},&nbsp;
            <strong>N:</strong> {resultData.n},&nbsp;
            <strong>K:</strong> {resultData.k},&nbsp;
            <strong>J:</strong> {resultData.j},&nbsp;
            <strong>S:</strong> {resultData.s}
          </p>
          <p><strong>Input Samples:</strong> {formatCombo(resultData.samples)}</p>

          <h3>Generated Optimal Groups ({resultData.combos.length})</h3>
          {resultData.combos.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee' }}>
              {resultData.combos.map((combo, index) => (
                <li key={index} style={{ padding: '5px', borderBottom: '1px solid #eee', fontFamily: 'monospace', backgroundColor: index % 2 === 0 ? '#f9f9f9' : 'white' }}>
                  {formatCombo(combo)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No combinations were generated or found in this result.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultPage;
