// App.js
import React from 'react';
import FileUpload from './FileUpload';

function App() {
  return (
    <div className="App">
      <header style={{ 
        backgroundColor: '#0070ba', 
        color: 'white', 
        padding: '20px 0',
        textAlign: 'center'
      }}>
        <h1>eBay Book Listing Tool</h1>
      </header>
      <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <FileUpload />
      </main>
      <footer style={{ 
        textAlign: 'center', 
        marginTop: '40px', 
        padding: '20px',
        borderTop: '1px solid #eee',
        color: '#777'
      }}>
        <p>&copy; 2025 BookLister for eBay Australia</p>
      </footer>
    </div>
  );
}

export default App;