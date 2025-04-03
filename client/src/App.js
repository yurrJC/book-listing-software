// App.js
import React, { useState } from 'react';
import FileUpload from './FileUpload';
import PriceSettingStep from './PriceSettingStep';
import ResultView from './ResultView';

function App() {
  const [currentStep, setCurrentStep] = useState('upload'); // 'upload', 'price', 'result'
  const [uploadData, setUploadData] = useState(null);
  const [result, setResult] = useState(null);

  // Handle successful upload
  const handleUploadSuccess = (data) => {
    setUploadData(data);
    setCurrentStep('price');
  };

  // Handle price submission
  const handlePriceSubmit = async (price) => {
    try {
      // Create form data for the API call
      const formData = new FormData();
      formData.append('price', price);
      formData.append('detectedISBN', uploadData.isbn);
      
      // You might need to include other data depending on your API
      
      // Call your API to create the listing with the custom price
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      const resultData = await response.json();
      setResult(resultData);
      setCurrentStep('result');
    } catch (error) {
      console.error('Error creating listing:', error);
      alert('Failed to create listing. Please try again.');
    }
  };

  // Handle going back to upload
  const handleBack = () => {
    setCurrentStep('upload');
  };

  // Handle reset to start over
  const handleReset = () => {
    setCurrentStep('upload');
    setUploadData(null);
    setResult(null);
  };

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
        {currentStep === 'upload' && (
          <FileUpload onSuccess={handleUploadSuccess} />
        )}
        
        {currentStep === 'price' && uploadData && (
          <PriceSettingStep
            mainImage={uploadData.mainImage}
            title={uploadData.metadata?.title || ''}
            isbn={uploadData.isbn}
            onSubmit={handlePriceSubmit}
            onBack={handleBack}
          />
        )}
        
        {currentStep === 'result' && result && (
          <ResultView result={result} onReset={handleReset} />
        )}
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