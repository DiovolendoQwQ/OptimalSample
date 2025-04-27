import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom'; // For navigating to result detail page

const DbManagerPage: React.FC = () => {
  const [dbFiles, setDbFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null); // Feedback for delete actions
  const navigate = useNavigate();

  // Function to fetch the list of DB files
  const fetchDbFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setActionStatus(null); // Clear previous action status
    try {
      if (window.electronAPI) {
        const files = await window.electronAPI.invoke('list-db-files'); // Corrected IPC call
        setDbFiles(files.sort()); // Sort files for consistent display
      } else {
        throw new Error("Electron API not available.");
      }
    } catch (err: any) {
      setError(`Failed to list database files: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch files when the component mounts
  useEffect(() => {
    fetchDbFiles();
  }, [fetchDbFiles]);

  // Function to handle deleting a file
  const handleDelete = useCallback(async (filename: string) => {
    // Basic confirmation
    if (!window.confirm(`Are you sure you want to delete ${filename}? This action cannot be undone.`)) {
      return;
    }

    setActionStatus(`Deleting ${filename}...`);
    setError(null); // Clear previous general errors
    try {
      if (window.electronAPI) {
        await window.electronAPI.invoke('delete-db-file', filename); // Corrected IPC call
        setActionStatus(`Successfully deleted ${filename}.`);
        // Refresh the list after deletion
        await fetchDbFiles();
        // Clear status after a delay
        setTimeout(() => setActionStatus(null), 3000);
      } else {
        throw new Error("Electron API not available.");
      }
    } catch (err: any) {
      console.error(`Error deleting ${filename}:`, err);
      setActionStatus(`Error deleting ${filename}: ${err.message}`);
    }
  }, [fetchDbFiles]); // Include fetchDbFiles in dependency array

  // Function to handle viewing a result (navigate to ResultPage)
  const handleView = (filename: string) => {
    // TODO: Implement navigation to ResultPage, possibly passing filename
    // This requires modifying ResultPage to load data based on the filename param
    console.log(`Navigating to view details for: ${filename}`);
    // Use navigate to go to the ResultPage with the filename as a URL parameter
    navigate(`/results/${encodeURIComponent(filename)}`);
    // Removed the alert as navigation is now implemented.
  };

  // Basic styling
  const listStyle: React.CSSProperties = {
    listStyle: 'none',
    padding: 0,
  };
  const listItemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    borderBottom: '1px solid #eee',
  };
  const buttonStyle: React.CSSProperties = {
    marginLeft: '10px',
    padding: '5px 10px',
    cursor: 'pointer',
    borderRadius: '4px',
    border: '1px solid transparent',
  };
  const viewButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#007bff',
    color: 'white',
    borderColor: '#007bff',
  };
  const deleteButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#dc3545',
    color: 'white',
    borderColor: '#dc3545',
  };
  const statusStyle: React.CSSProperties = {
    marginTop: '15px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px'
  };


  return (
    <div>
      <h2>Manage Saved Results</h2>

      <button onClick={fetchDbFiles} disabled={isLoading} style={{ ...buttonStyle, backgroundColor: '#28a745', color: 'white', marginBottom: '15px' }}>
        {isLoading ? 'Refreshing...' : 'Refresh List'}
      </button>

      {actionStatus && (
        <div style={{ ...statusStyle, borderColor: actionStatus.startsWith('Error') ? 'red' : 'green', backgroundColor: actionStatus.startsWith('Error') ? '#ffebee' : '#e8f5e9' }}>
          {actionStatus}
        </div>
      )}
      {error && <p style={{ color: 'red' }}>Error fetching list: {error}</p>}


      {isLoading && !dbFiles.length && <p>Loading saved results...</p>}
      {!isLoading && !error && dbFiles.length === 0 && <p>No saved result files found in the database directory.</p>}

      {!isLoading && dbFiles.length > 0 && (
        <ul style={listStyle}>
          {dbFiles.map((filename) => (
            <li key={filename} style={listItemStyle}>
              <span>{filename}</span>
              <div>
                <button onClick={() => handleView(filename)} style={viewButtonStyle}>
                  View
                </button>
                <button onClick={() => handleDelete(filename)} style={deleteButtonStyle}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DbManagerPage;
