import React, { useState } from 'react';
import FileUpload from './FileUpload';
import PriceSettingStep from './PriceSettingStep';
import ResultView from './ResultView';

function App() {
  const [step, setStep] = useState(1); // 1: Upload, 2: Price/Review, 3: Result
  const [processedData, setProcessedData] = useState(null); // Holds data from /processBook
  const [originalFiles, setOriginalFiles] = useState([]); // Holds the actual File objects

  // Callback from FileUpload
  const handleProcessSuccess = ({ apiResponseData, originalFileObjects, customDescriptionNote }) => {
    console.log('App: Received data from FileUpload:', apiResponseData);
    console.log('App: Received File objects:', originalFileObjects.length);
    console.log('App: Received custom description note:', customDescriptionNote);
    setProcessedData(apiResponseData); // Store response from /api/processBook
    setOriginalFiles(originalFileObjects); // Store the File objects
    // Store custom description note in processedData
    setProcessedData(prevData => ({
      ...apiResponseData,
      customDescriptionNote: customDescriptionNote
    }));
    setStep(2); // Move to the next step
  };

  // Callback from PriceSettingStep
  const handleListingSuccess = (listingResponse) => {
    console.log('App: Received data from PriceSettingStep (listing success):', listingResponse);
    // Combine the listing response with the initial processed data for ResultView
    setProcessedData(prevData => ({
      ...prevData, // Keep initial metadata, isbn, etc.
      listingResponse: listingResponse // Add the response from /api/createListing
    }));
    setStep(3); // Move to result view
  };

  // Go back from PriceSettingStep to FileUpload
  const handleGoBack = () => {
    setProcessedData(null);
    setOriginalFiles([]);
    setStep(1);
  };

  // Reset after viewing result
  const handleReset = () => {
    setProcessedData(null);
    setOriginalFiles([]);
    setStep(1);
  };

  return (
    <div className="App">
      {step === 1 && <FileUpload onSuccess={handleProcessSuccess} />}
      {step === 2 && processedData && (
        <PriceSettingStep
          onSubmit={handleListingSuccess}
          onBack={handleGoBack}
          // Pass data from the /processBook response
          isbn={processedData.isbn}
          metadata={processedData.metadata}
          ebayTitle={processedData.ebayTitle}
          selectedCondition={processedData.condition} // Use the FINAL condition
          selectedFlawKeys={processedData.selectedFlawKeys}
          ocrText={processedData.ocrText}
          conditionDowngraded={processedData.conditionDowngraded} // Pass this too if needed for display
          customDescriptionNote={processedData.customDescriptionNote} // Pass custom description note
          // *** Pass the ACTUAL File objects ***
          imageFileObjects={originalFiles}
        />
      )}
      {step === 3 && processedData && processedData.listingResponse && (
        <ResultView
           // Pass combined data: initial process data + listing response
           result={processedData}
           onReset={handleReset}
        />
      )}
    </div>
  );
}

export default App;