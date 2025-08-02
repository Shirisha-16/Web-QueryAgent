
import React from 'react';
import QueryAgent from './components/QueryAgent';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Web Query Agent</h1>
      </header>
      <main>
        <QueryAgent />
      </main>
      <footer>
        <p>&copy; 2025 Web Query Agent</p>
      </footer>
    </div>
  );
}

export default App;