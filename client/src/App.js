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
    console.log("Upload success with data:", data);
    setUploadData(data);
    setCurrentStep('price');
  };

  // Handle price submission result
  const handleListingCreated = (resultData) => {
    console.log("Listing created successfully:", resultData);
    setResult(resultData);
    setCurrentStep('result');
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

  // Log the uploadData to see what's available
  console.log("Current uploadData:", uploadData);

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
            ebayTitle={uploadData.ebayTitle || uploadData.metadata?.title || ''}
            // Pass all the required data:
            allImages={uploadData.allImages}
            metadata={uploadData.metadata}
            detectedFlaws={uploadData.detectedFlaws}
            condition={uploadData.condition}
            ocrText={uploadData.ocrText}
            // Add these new properties:
            bookGenres={uploadData.bookGenres || []}
            bookTopics={uploadData.bookTopics || []}
            narrativeType={uploadData.narrativeType || ''}
            onSubmit={handleListingCreated}
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