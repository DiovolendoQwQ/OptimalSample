import React, { useState, useCallback, FormEvent } from 'react';
import { AlgorithmParams } from '@/shared/types';
// Optional: Import a UI library component if used (e.g., Button, Input from MUI, Antd)

// Define the props for the form component
interface ParamFormProps {
  onSubmit: (params: AlgorithmParams) => Promise<void>; // Function to call when form is submitted
  isSubmitting: boolean; // Flag to disable form during submission
}

// Define the state structure for the form inputs
interface FormState {
  m: string;
  n: string;
  k: string;
  j: string;
  s: string;
  t: string;
  workers: string; // Add workers state
  samples: string; // Samples entered as comma-separated string
}

const ParamForm: React.FC<ParamFormProps> = ({ onSubmit, isSubmitting }) => {
  const [formState, setFormState] = useState<FormState>({
    m: '45', // Default values based on project constraints/examples
    n: '7',
    k: '6',  // Default k to 6 as per project description
    j: '5',
    s: '5',
    t: '1',
    workers: '8', // Default workers to 8
    samples: '',
  });
  const [error, setError] = useState<string | null>(null);

  // Handler for input changes
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormState(prevState => ({
      ...prevState,
      [name]: value,
    }));
    // Clear error when user starts typing again
    if (error) setError(null);
  }, [error]);

  // Handler for Random Select button
  const handleRandomSelect = useCallback(() => {
    setError(null); // Clear previous errors
    try {
      const mVal = parseInt(formState.m, 10);
      const nVal = parseInt(formState.n, 10);

      if (isNaN(mVal) || isNaN(nVal) || mVal <= 0 || nVal <= 0) {
        throw new Error("Please enter valid positive integers for 'm' and 'n'.");
      }
      if (nVal > mVal) {
        throw new Error("'n' (samples to select) cannot be greater than 'm' (total samples).");
      }
      if (nVal < 7 || nVal > 25 || mVal < 45 || mVal > 54) {
        // Basic range check based on project constraints
        console.warn("m or n is outside typical project constraints (m: 45-54, n: 7-25), but proceeding.");
      }

      // Generate n random unique numbers from 1 to m
      const allPossible = Array.from({ length: mVal }, (_, i) => i + 1);
      const selectedSamples: number[] = [];
      while (selectedSamples.length < nVal) {
        const randomIndex = Math.floor(Math.random() * allPossible.length);
        const sample = allPossible.splice(randomIndex, 1)[0]; // Remove selected sample
        selectedSamples.push(sample);
      }

      // Format samples as "01,02,..." and update state
      const formattedSamples = selectedSamples.sort((a, b) => a - b).map(s => String(s).padStart(2, '0')).join(',');
      setFormState(prevState => ({ ...prevState, samples: formattedSamples }));

    } catch (err: any) {
      console.error("Random select error:", err);
      setError(err.message || "Failed to generate random samples.");
    }
  }, [formState.m, formState.n]);


  // Handler for form submission
  const handleSubmit = useCallback(async (event: FormEvent) => {
    event.preventDefault(); // Prevent default form submission
    setError(null); // Clear previous errors

    // --- Basic Frontend Validation ---
    // Convert string inputs to numbers
    const mNum = parseInt(formState.m, 10);
    const nNum = parseInt(formState.n, 10);
    const kNum = parseInt(formState.k, 10);
    const jNum = parseInt(formState.j, 10);
    const sNum = parseInt(formState.s, 10);
    const tNum = parseInt(formState.t, 10);
    const workersNum = parseInt(formState.workers, 10); // Parse workers

    if (isNaN(mNum) || isNaN(nNum) || isNaN(kNum) || isNaN(jNum) || isNaN(sNum) || isNaN(tNum) || isNaN(workersNum)) { // Add workersNum check
      setError("All parameters (m, n, k, j, s, t, workers) must be valid numbers.");
      return;
    }
    if (workersNum <= 0) { // Basic validation for workers
      setError("Number of workers must be a positive integer.");
      return;
    }

    // Parse samples string into array of numbers
    const sampleParts = formState.samples.split(',').map(p => p.trim()).filter(p => p !== '');
    const samplesNum = sampleParts.map(Number);

    if (samplesNum.some(isNaN)) {
      setError("Samples input contains non-numeric values.");
      return;
    }
    if (sampleParts.length !== samplesNum.length || sampleParts.length === 0) {
      setError("Samples input is invalid or empty. Use comma-separated numbers (e.g., 01,02,03).");
      return;
    }

    const params: AlgorithmParams = {
      m: mNum,
      n: nNum,
      k: kNum,
      j: jNum,
      s: sNum,
      t: tNum,
      workers: workersNum, // Add workers to params
      samples: samplesNum,
    };

    // --- Call the onSubmit prop (provided by parent component) ---
    // The parent (HomePage) will handle calling the Electron API
    try {
      // Optional: Use quick validator before calling onSubmit if desired
      // import { quickValidateParamsForUI } from '@/services/validator';
      // if (!quickValidateParamsForUI(params)) {
      //     throw new Error("Basic validation failed. Please check constraints.");
      // }
      await onSubmit(params);
      // Optionally clear form or give success feedback here if needed
    } catch (err: any) {
      console.error("Form submission error:", err);
      setError(err.message || "An unknown error occurred during submission.");
    }
  }, [formState, onSubmit]);

  // Basic form styling (can be replaced with CSS Modules, Tailwind, etc.)
  const inputStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '10px',
    padding: '8px',
    width: '95%', // Adjust as needed
    maxWidth: '400px',
    border: '1px solid #ccc',
    borderRadius: '4px',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold',
  };
  const buttonStyle: React.CSSProperties = {
    padding: '10px 15px',
    marginRight: '10px',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#007bff',
    color: 'white',
    opacity: isSubmitting ? 0.6 : 1,
  };
  const errorStyle: React.CSSProperties = {
    color: 'red',
    marginTop: '10px',
    fontWeight: 'bold',
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label style={labelStyle} htmlFor="m">M (Total Samples, 45-54):</label>
        <input
          style={inputStyle}
          type="number"
          id="m"
          name="m"
          value={formState.m}
          onChange={handleChange}
          required
          min="45"
          max="54"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="n">N (Selected Samples, 7-25):</label>
        <input
          style={inputStyle}
          type="number"
          id="n"
          name="n"
          value={formState.n}
          onChange={handleChange}
          required
          min="7"
          max="25"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="k">K (Group Size, 4-7):</label>
        <input
          style={inputStyle}
          type="number"
          id="k"
          name="k"
          value={formState.k}
          onChange={handleChange}
          required
          min="4"
          max="7"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="j">J (Subset Size to Check, s ≤ j ≤ k):</label>
        <input
          style={inputStyle}
          type="number"
          id="j"
          name="j"
          value={formState.j}
          onChange={handleChange}
          required
          min={formState.s} // Dynamic min based on s
          max={formState.k} // Dynamic max based on k
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="s">S (Internal Subset Size, 3-7, s ≤ j):</label>
        <input
          style={inputStyle}
          type="number"
          id="s"
          name="s"
          value={formState.s}
          onChange={handleChange}
          required
          min="3"
          max="7" // Also limited by j and k implicitly by other fields
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="t">T (Coverage Threshold, 1 ≤ t ≤ j):</label>
        <input
          style={inputStyle}
          type="number"
          id="t"
          name="t"
          value={formState.t}
          onChange={handleChange}
          required
          min="1"
          max={formState.j} // Dynamic max based on j
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="workers">Workers (CPU Cores, ≥1):</label>
        <input
          style={inputStyle}
          type="number"
          id="workers"
          name="workers"
          value={formState.workers}
          onChange={handleChange}
          required
          min="1" // Minimum 1 worker
          // No explicit max, but user should be mindful of CPU cores
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="samples">Selected Samples (comma-separated, e.g., 01,02,...):</label>
        <textarea
          style={{ ...inputStyle, height: '60px', resize: 'vertical' }}
          id="samples"
          name="samples"
          value={formState.samples}
          onChange={handleChange}
          required
          placeholder={`Enter ${formState.n || 'N'} comma-separated numbers`}
          disabled={isSubmitting}
          rows={3}
        />
        <button
          type="button" // Prevent form submission
          onClick={handleRandomSelect}
          style={{ ...buttonStyle, backgroundColor: '#6c757d', marginLeft: '0px', marginTop: '5px' }}
          disabled={isSubmitting || !formState.m || !formState.n || parseInt(formState.n, 10) <= 0 || parseInt(formState.m, 10) <= 0}
        >
          Random Select Samples
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <button
        type="submit"
        style={buttonStyle}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Generating...' : 'Generate Optimal Groups'}
      </button>
    </form>
  );
};

export default ParamForm;
