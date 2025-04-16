/* PriceSettingStep.js */
import React, { useState, useEffect } from 'react';
import './PriceSettingStep.css';

// Define API base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://book-listing-software.onrender.com';

// --- Prop List Including File Objects ---
function PriceSettingStep({
  onSubmit,
  onBack,
  // Data from previous step's processing:
  isbn,
  metadata,
  ebayTitle,
  // --- NEW/REVISED: Need the actual File objects ---
  imageFileObjects, // *** EXPECTING: Array of File objects ***
  // --- End New/Revised ---
  selectedCondition,
  selectedFlawKeys,
  ocrText,
  // Removed: mainImage, allImages (filenames/paths less useful now)
}) {
  // --- State remains the same ---
  const [price, setPrice] = useState('19.99');
  const [sku, setSku] = useState('');
  const [listingTitle, setListingTitle] = useState(ebayTitle || metadata?.title || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setListingTitle(ebayTitle || metadata?.title || '');
  }, [ebayTitle, metadata?.title]);

  // Debugging useEffect (Revised to check imageFileObjects)
  useEffect(() => {
    console.log('PriceSettingStep received props:', {
      isbn,
      metadataExists: !!metadata,
      ebayTitle: ebayTitle || 'Not provided',
      imageFileObjectsCount: imageFileObjects ? imageFileObjects.length : 'Not provided!', // Check files
      selectedCondition: selectedCondition || 'Not provided!',
      selectedFlawKeys: selectedFlawKeys || 'Not provided!',
      ocrTextLength: ocrText ? ocrText.length : 0,
    });

    // Validation for critical props
    if (!selectedCondition) {
        console.error("PriceSettingStep Critical Error: selectedCondition prop is missing!");
        setError("Configuration error: Condition data missing. Please go back.");
    }
    if (!imageFileObjects || imageFileObjects.length === 0) {
        console.error("PriceSettingStep Critical Error: imageFileObjects prop is missing or empty!");
        setError("Configuration error: Image data missing. Please go back.");
    }
    // selectedFlawKeys check remains warning

  }, [isbn, metadata, ebayTitle, imageFileObjects, selectedCondition, selectedFlawKeys, ocrText]);


  useEffect(() => { // Copy Success Timer (no change)
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  const handleCopyISBN = () => { // No change
    if (isbn) {
      navigator.clipboard.writeText(isbn)
        .then(() => setCopySuccess(true))
        .catch(err => console.error('Failed to copy ISBN:', err));
    }
  };

  // --- *** MAJOR UPDATE: handleSubmit uses FormData *** ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('Starting listing creation (sending FormData)...');

    // --- Basic Validation (keep as is) ---
    if (!selectedCondition) { /* ... set error ... */ return; }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) { /* ... set error ... */ return; }
    if (!listingTitle || listingTitle.trim().length === 0) { /* ... set error ... */ return; }
    if (!imageFileObjects || imageFileObjects.length === 0) { // Check actual file objects
        setError('No image files available for listing. Please go back.');
        setLoading(false);
        return;
    }
    // --- End Validation ---

    try {
        // *** 1. Create FormData ***
        const formData = new FormData();

        // *** 2. Append Image Files ***
        // The backend expects files under the 'imageFiles' key
        imageFileObjects.forEach((file) => {
            formData.append('imageFiles', file, file.name); // Append each file object
        });

        // *** 3. Append Other Data as Fields ***
        formData.append('isbn', isbn || '');
        formData.append('price', price);
        formData.append('sku', sku || '');
        formData.append('selectedCondition', selectedCondition);
        formData.append('selectedFlawKeys', JSON.stringify(selectedFlawKeys || [])); // Send flaws as JSON string
        formData.append('ocrText', ocrText || '');

        // Add custom title ONLY if it was manually changed
        if (listingTitle !== ebayTitle && listingTitle !== metadata?.title) {
            formData.append('customTitle', listingTitle);
        }

        // Add necessary metadata fields required by backend
        // (Backend might refetch, but sending helps consistency)
        formData.append('title', metadata?.title || '');
        formData.append('author', metadata?.author || '');
        formData.append('publisher', metadata?.publisher || '');
        formData.append('publicationYear', metadata?.publicationYear || '');
        formData.append('synopsis', metadata?.synopsis || '');
        formData.append('language', metadata?.language || '');
        formData.append('format', metadata?.format || ''); // Or binding
        formData.append('subjects', JSON.stringify(metadata?.subjects || [])); // Send as JSON string if needed
        formData.append('ebayTitle', ebayTitle || ''); // Send the originally generated title too

        console.log('FormData prepared. Sending to /api/createListing...');
        // Logging FormData contents is tricky, but check keys:
        for (let key of formData.keys()) {
            console.log(`FormData key: ${key}`);
        }


      // *** 4. Send FormData using Fetch ***
      const response = await fetch(`${API_BASE_URL}/api/createListing`, {
        method: 'POST',
        // ** DO NOT set Content-Type header manually for FormData **
        // headers: { 'Content-Type': 'application/json' }, // REMOVE THIS
        body: formData, // Pass the FormData object directly
        // credentials: 'include', // Only if needed
        // mode: 'cors' // Only if needed
      });

      // --- Process Response (mostly the same as before) ---
      const responseText = await response.text();
      console.log(`API Response Status: ${response.status}`);
      console.log('API Raw Response Text:', responseText.substring(0, 500) + '...');

      if (!response.ok) { // Check if status is 2xx
        let errorMessage = `Failed to create listing (Status: ${response.status}).`;
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.details?.LongMessage) { // Check details for eBay error
            errorMessage = `eBay Error: ${errorData.details.LongMessage}`;
          } else {
             errorMessage = responseText || errorMessage; // Use raw text if no specific error found
          }
        } catch (parseErr) {
          console.warn('Failed to parse error response as JSON:', parseErr);
          errorMessage = responseText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Parse success response
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Listing creation successful:', data);
      } catch (parseErr) {
        console.error('Failed to parse success response:', parseErr);
        throw new Error('Received invalid success response from server');
      }

      onSubmit(data); // Pass success data back up

    } catch (err) {
      console.error('Error during listing creation fetch:', err);
      setError(err.message || 'An unknown error occurred during listing creation.');
    } finally {
      setLoading(false);
    }
  };

  // --- JSX (ensure image display logic is correct without `mainImage` or `allImages` filenames) ---
  const getImageUrl = () => {
      // Prioritize metadata cover URL if available
      if (metadata?.coverUrl) {
          return metadata.coverUrl;
      }
      // Otherwise, create a temporary URL from the first File object for preview
      if (imageFileObjects && imageFileObjects.length > 0) {
          // Important: Create and revoke URL to avoid memory leaks
          // This might require storing the URL in state if it causes re-renders
          return URL.createObjectURL(imageFileObjects[0]);
      }
      return null; // No image available
  }

  const previewImageUrl = getImageUrl();

   // Clean up object URL when component unmounts or image changes
   useEffect(() => {
    const currentUrl = previewImageUrl; // Capture the current URL
    if (currentUrl && currentUrl.startsWith('blob:')) {
      return () => {
        console.log("Revoking Object URL:", currentUrl);
        URL.revokeObjectURL(currentUrl);
      };
    }
  }, [previewImageUrl]); // Dependency on the URL string


  return (
    <div className="listing-container">
      <div className="listing-header">
        <h2>Review Details & Set Price</h2>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="listing-content">
        <div className="book-details">
          <div className="book-cover">
            {/* Updated Image Display Logic */}
            {previewImageUrl ? (
              <img src={previewImageUrl} alt={metadata?.title || 'Book Cover Preview'} className="preview-image"/>
            ) : (
              <div className="no-image">No Image</div>
            )}
          </div>

          {/* Book Info Display (no changes needed here) */}
          <div className="book-info">
             <h3 className="book-title-preview">{metadata?.title || 'Unknown Title'}</h3>
             <p className="book-author-preview">{metadata?.author || 'Unknown Author'}</p>
            <table className="info-table">
              <tbody>
                <tr><td><strong>ISBN:</strong></td><td>{/* ... ISBN display ... */}</td></tr>
                <tr><td><strong>Condition:</strong></td><td>{selectedCondition || <span style={{color: 'red'}}>Missing!</span>}</td></tr>
                {selectedFlawKeys && selectedFlawKeys.length > 0 && (<tr><td><strong>Flaws:</strong></td><td>{selectedFlawKeys.map(key => FLAW_DEFINITIONS[key]?.label || key).join(', ')}</td></tr>)}
                <tr><td><strong>Images:</strong></td><td>{imageFileObjects ? imageFileObjects.length : 0}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Form (no major changes to inputs themselves) */}
        <div className="listing-form">
          <form onSubmit={handleSubmit}>
            {/* Title */}
            <div className="form-group">
              <label htmlFor="listingTitle" className="form-label">eBay Listing Title (Edit if needed):</label>
              <input id="listingTitle" type="text" value={listingTitle} onChange={(e) => setListingTitle(e.target.value)} placeholder="Enter eBay listing title" maxLength={80} className="form-input title-input" required/>
              <div className="character-count">{listingTitle.length}/80</div>
            </div>
            {/* SKU / Price */}
            <div className="form-row">
                <div className="form-group"><label htmlFor="sku" className="form-label">SKU (Optional):</label><input id="sku" type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Enter SKU" className="form-input"/></div>
                <div className="form-group"><label htmlFor="price" className="form-label">Price (AUD):</label><input id="price" type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g., 19.99" className="form-input" required/></div>
            </div>
            {/* Actions */}
            <div className="action-buttons">
              <button type="button" onClick={onBack} className="btn back-button" disabled={loading}>Back</button>
              <button type="submit" className="btn submit-button" disabled={loading || !selectedCondition || !imageFileObjects || imageFileObjects.length === 0}>
                {loading ? <><LoadingSpinner /> Creating...</> : 'Create eBay Listing'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// FLAW_DEFINITIONS needed for display
const FLAW_DEFINITIONS = { /* ... same as before ... */ };
// Spinner needed for display
const LoadingSpinner = () => <div className="spinner" style={{ /* ... */ }}></div>;

export default PriceSettingStep;