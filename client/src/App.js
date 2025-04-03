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
      // This needs to change - we need to create a listing with the price
      // rather than re-uploading the images
      
      // Create a new endpoint for creating the listing with the price
      const response = await fetch('/api/createListing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isbn: uploadData.isbn,
          price: price,
          // Any other data needed to identify the book/upload
          uploadId: uploadData.uploadId || null // If your API uses an upload ID
        })
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
            // Add the eBay title for display
            ebayTitle={uploadData.ebayTitle || uploadData.metadata?.title || ''}
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