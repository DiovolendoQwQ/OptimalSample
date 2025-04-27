import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Import the root component
// Optional: Import global styles if you have them
// import './index.css';

// Find the root element in the HTML
const rootElement = document.getElementById('root');

// Ensure the root element exists before rendering
if (rootElement) {
  // Create a React root and render the App component
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element with ID "root" in index.html');
}
