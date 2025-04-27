import React from 'react';
// Removed duplicate React import
import { HashRouter as Router, Routes, Route, NavLink } from 'react-router-dom';

// Import actual page components
import HomePage from './pages/Home';
import ResultPage from './pages/Result';
import DbManagerPage from './pages/DbManager';

// Removed placeholder components

// Optional: Basic styling for navigation
const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  padding: '1rem',
  backgroundColor: '#f0f0f0',
  marginBottom: '1rem',
};

const activeLinkStyle: React.CSSProperties = {
  fontWeight: 'bold',
  textDecoration: 'underline',
};

function App() {
  return (
    <Router>
      <div>
        {/* Basic Navigation */}
        <nav style={navStyle}>
          <NavLink
            to="/"
            style={({ isActive }) => (isActive ? activeLinkStyle : undefined)}
          >
            Home (Input)
          </NavLink>
          {/* Removed "Last Result" NavLink as specific results are viewed via DbManager */}
          <NavLink
            to="/db"
            style={({ isActive }) => (isActive ? activeLinkStyle : undefined)}
          >
            Manage Results
          </NavLink>
        </nav>

        {/* Page Content */}
        <div style={{ padding: '1rem' }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            {/* Route for page showing details of a specific result file */}
            <Route path="/results/:filename" element={<ResultPage />} />
            {/* Route for the general results path (e.g., if navigated without filename) */}
            <Route path="/results" element={<ResultPage />} />
            <Route path="/db" element={<DbManagerPage />} />
            {/* Add other routes as needed */}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
