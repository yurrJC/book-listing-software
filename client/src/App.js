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
    console.log("App.js: Upload success data received:", data); // Enhanced logging
    setUploadData(data);
    setCurrentStep('price');
  };

  // Handle price submission result
  const handleListingCreated = (resultData) => {
    console.log("App.js: Listing created successfully:", resultData);
    setResult(resultData);
    setCurrentStep('result');
  };

  // Handle going back to upload
  const handleBack = () => {
    setCurrentStep('upload');
    // Optionally clear uploadData if you want a clean slate on going back
    // setUploadData(null);
  };

  // Handle reset to start over
  const handleReset = () => {
    setCurrentStep('upload');
    setUploadData(null);
    setResult(null);
  };

  return (
    <div className="App">
      {/* ... Header ... */}
      <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        {currentStep === 'upload' && (
          <FileUpload onSuccess={handleUploadSuccess} />
        )}

        {/* === CORRECTED PROP PASSING FOR PriceSettingStep === */}
        {currentStep === 'price' && uploadData && (
          <PriceSettingStep
            // Data needed for display/identification
            isbn={uploadData.isbn}
            metadata={uploadData.metadata} // Contains original title, author, etc.
            ebayTitle={uploadData.ebayTitle} // The generated title
            mainImage={uploadData.mainImage} // Filename for display
            allImages={uploadData.allImages} // Array of {filename, path, mimetype}

            // *** CORRECTED PROPS FOR CONDITION/FLAWS ***
            selectedCondition={uploadData.condition} // Pass backend's 'condition' as 'selectedCondition' prop
            selectedFlawKeys={uploadData.selectedFlawKeys} // Pass backend's 'selectedFlawKeys' as 'selectedFlawKeys' prop

            // Other necessary data
            ocrText={uploadData.ocrText}

            // Callbacks
            onSubmit={handleListingCreated}
            onBack={handleBack}

            // *** REMOVED/REPLACED PROPS ***
            // title={uploadData.metadata?.title || ''} // Redundant if metadata is passed
            // detectedFlaws={uploadData.detectedFlaws} // Replaced by selectedFlawKeys
            // condition={uploadData.condition} // Replaced by selectedCondition prop name
          />
        )}
        {/* ==================================================== */}

        {currentStep === 'result' && result && (
          <ResultView result={result} onReset={handleReset} />
        )}
      </main>
      {/* ... Footer ... */}
    </div>
  );
}

export default App;