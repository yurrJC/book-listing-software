/* PriceSettingStep.js */
import React, { useState, useEffect } from 'react';
import './PriceSettingStep.css';

// Define API base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://book-listing-software.onrender.com';

// --- Updated Prop List ---
function PriceSettingStep({
  onSubmit,
  onBack,
  // Data from previous step's processing:
  isbn,
  metadata,       // Contains title, author, publisher, format, language, subjects etc.
  ebayTitle,      // The generated title from backend
  mainImage,      // Filename of the main image determined in prev step
  allImages,      // Array of { filename, path, mimetype } objects
  selectedCondition, // *** NEW: The FINAL condition string (e.g., "Good", "Acceptable") ***
  selectedFlawKeys,  // *** NEW: Array of selected flaw keys (e.g., ["COVER_CREASING"]) ***
  ocrText,        // For potential title regeneration if needed by backend
  // Removed: title, condition, detectedFlaws (replaced by props above)
}) {
  // --- State remains mostly the same ---
  const [price, setPrice] = useState('19.99'); // Consider making default dynamic or empty
  const [sku, setSku] = useState('');
  const [listingTitle, setListingTitle] = useState(ebayTitle || metadata?.title || ''); // Use ebayTitle or metadata title
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Update listingTitle state if the ebayTitle prop changes
  useEffect(() => {
    setListingTitle(ebayTitle || metadata?.title || '');
  }, [ebayTitle, metadata?.title]);

  // Log props on component mount for debugging
  useEffect(() => {
    console.log('PriceSettingStep received props:', {
      isbn,
      metadataExists: !!metadata,
      ebayTitle: ebayTitle || 'Not provided',
      mainImage: mainImage || 'No main image provided',
      allImagesCount: allImages ? allImages.length : 0,
      selectedCondition: selectedCondition || 'Not provided!', // Log if missing
      selectedFlawKeys: selectedFlawKeys || 'Not provided!',   // Log if missing
      ocrTextLength: ocrText ? ocrText.length : 0,
    });

    // Add a check here to ensure required props are present
    if (!selectedCondition) {
        console.error("PriceSettingStep Critical Error: selectedCondition prop is missing!");
        setError("Configuration error: Condition data missing. Please go back.");
    }
     if (!selectedFlawKeys) { // Check if it's missing (should be an array)
        console.warn("PriceSettingStep Warning: selectedFlawKeys prop is missing. Assuming no flaws.");
        // Don't set an error, maybe just default to empty array later
    }


  }, [isbn, metadata, ebayTitle, mainImage, allImages, selectedCondition, selectedFlawKeys, ocrText]);

  // Reset copy success message (remains the same)
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  // Copy ISBN handler (remains the same)
  const handleCopyISBN = () => {
    if (isbn) {
      navigator.clipboard.writeText(isbn)
        .then(() => setCopySuccess(true))
        .catch(err => console.error('Failed to copy ISBN:', err));
    }
  };

  // --- Updated handleSubmit ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('Starting listing creation...');
    console.log('Selected Condition being sent:', selectedCondition);
    console.log('Selected Flaw Keys being sent:', selectedFlawKeys);
    console.log('Final Listing Title:', listingTitle);
    console.log('Price:', price);
    console.log('SKU:', sku);

    // Basic validation before sending
    if (!selectedCondition) {
        setError("Cannot create listing: Condition is missing. Please go back.");
        setLoading(false);
        return;
    }
     if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
        setError("Please enter a valid positive price.");
        setLoading(false);
        return;
    }
      if (!listingTitle || listingTitle.trim().length === 0) {
        setError("Listing title cannot be empty.");
        setLoading(false);
        return;
    }
     if (!allImages || allImages.length === 0) {
      setError('No images available for listing. Please go back.');
      setLoading(false);
      return;
    }


    try {
      // Prepare the request payload - ensure all necessary fields are included
      const requestData = {
        // Core Listing Info
        isbn,
        price,
        sku,
        customTitle: (listingTitle !== ebayTitle && listingTitle !== metadata?.title) ? listingTitle : null, // Send only if manually changed from BOTH originals

        // Data from processed step
        selectedCondition, // *** Use the prop directly ***
        selectedFlawKeys: selectedFlawKeys || [], // *** Use the prop, default to empty array ***
        imageFiles: allImages, // Pass the array of {filename, path, mimetype}
        ocrText: ocrText || '',

        // Pass necessary metadata fields needed by the backend's createEbayDraftListing
        title: metadata?.title, // Original title from metadata
        author: metadata?.author,
        publisher: metadata?.publisher,
        publicationYear: metadata?.publicationYear,
        synopsis: metadata?.synopsis,
        language: metadata?.language,
        format: metadata?.format, // Or binding
        subjects: metadata?.subjects,
        ebayTitle: ebayTitle // Pass the generated one too
        // NOTE: Removed 'mainImage' key if 'imageFiles' is structured correctly
        // NOTE: Removed old 'flaws' key
      };

      console.log('Sending payload to /api/createListing:', JSON.stringify(requestData, null, 2));

      // Send request to the server
      const response = await fetch(`${API_BASE_URL}/api/createListing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
        // credentials: 'include', // Only if needed for auth
        // mode: 'cors' // Only if needed and configured
      });

      const responseText = await response.text(); // Get text first for debugging
      console.log(`API Response Status: ${response.status}`);
      console.log('API Raw Response Text:', responseText.substring(0, 500) + '...');

      if (!response.ok) {
        let errorMessage = 'Failed to create listing.';
        try {
          const errorData = JSON.parse(responseText);
          // Check for specific error structure from backend
          if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.listingResponse && errorData.listingResponse.errors) {
            // Handle eBay API errors returned via listingResponse
            const ebayError = errorData.listingResponse.errors;
             errorMessage = `eBay Error: ${ebayError.ShortMessage || ebayError.LongMessage || 'Unknown eBay error'}`;
             // You might want to extract specific error codes or messages here
          } else {
            errorMessage = responseText || `Server error (${response.status})`;
          }
        } catch (parseErr) {
          console.error('Failed to parse error response:', parseErr);
          errorMessage = responseText || `Server error (${response.status})`; // Use raw text if JSON parsing fails
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

      onSubmit(data); // Pass success data (including eBay listing ID etc.) back up

    } catch (err) {
      console.error('Error during listing creation:', err);
      setError(err.message || 'An unknown error occurred.'); // Display the error message
    } finally {
      setLoading(false);
    }
  };

  // --- JSX remains largely the same, ensuring props are used correctly ---
  return (
    <div className="listing-container"> {/* Use CSS class names from PriceSettingStep.css */}
      <div className="listing-header">
        <h2>Review Details & Set Price</h2> {/* Updated Title */}
      </div>

      {error && (
        <div className="error-message"> {/* Use CSS class */}
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="listing-content">
        <div className="book-details">
          <div className="book-cover">
            {/* Logic for displaying cover image */}
            {metadata?.coverUrl ? (
              <img src={metadata.coverUrl} alt={metadata.title || 'Book Cover'} className="preview-image"/>
            ) : mainImage ? (
              <img src={`${API_BASE_URL}/uploads/${mainImage}`} alt="Uploaded book cover" className="preview-image"/>
            ) : allImages && allImages.length > 0 ? (
              <img src={`${API_BASE_URL}/uploads/${allImages[0]?.filename}`} alt="First uploaded image" className="preview-image"/>
            ) : (
              <div className="no-image">No Image</div>
            )}
          </div>

          <div className="book-info">
            <h3 className="book-title-preview">{metadata?.title || 'Unknown Title'}</h3>
            <p className="book-author-preview">{metadata?.author || 'Unknown Author'}</p>
            <table className="info-table">
              <tbody>
                <tr>
                  <td><strong>ISBN:</strong></td>
                  <td>
                    <div className="isbn-container">
                      <span>{isbn || 'N/A'}</span>
                      {isbn && <button type="button" className="copy-button" onClick={handleCopyISBN} title="Copy ISBN">
                        {copySuccess ? 'Copied!' : 'Copy'}
                      </button>}
                    </div>
                  </td>
                </tr>
                 {/* Display Condition */}
                 <tr>
                  <td><strong>Condition:</strong></td>
                  <td>{selectedCondition || <span style={{color: 'red'}}>Missing!</span>}</td>
                </tr>
                {/* Display Flaws */}
                {selectedFlawKeys && selectedFlawKeys.length > 0 && (
                    <tr>
                        <td><strong>Flaws:</strong></td>
                        <td>
                            {selectedFlawKeys.map(key => FLAW_DEFINITIONS[key]?.label || key).join(', ')}
                        </td>
                    </tr>
                )}
                <tr>
                  <td><strong>Images:</strong></td>
                  <td>{allImages ? allImages.length : 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="listing-form">
          <form onSubmit={handleSubmit}>
            {/* Editable title field */}
            <div className="form-group">
              <label htmlFor="listingTitle" className="form-label">eBay Listing Title (Edit if needed):</label>
              <input
                id="listingTitle"
                type="text"
                value={listingTitle}
                onChange={(e) => setListingTitle(e.target.value)}
                placeholder="Enter eBay listing title"
                maxLength={80}
                className="form-input title-input" // Use CSS classes
                required
              />
              <div className="character-count">{listingTitle.length}/80</div>
            </div>

            {/* SKU and Price */}
            <div className="form-row"> {/* Use for side-by-side layout if desired */}
                <div className="form-group">
                    <label htmlFor="sku" className="form-label">SKU (Optional):</label>
                    <input
                        id="sku"
                        type="text"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        placeholder="Enter SKU"
                        className="form-input" // Use CSS class
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="price" className="form-label">Price (AUD):</label>
                    <input
                        id="price"
                        type="number" // Use number type for better validation/input
                        step="0.01" // Allow cents
                        min="0.01" // Minimum price
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="e.g., 19.99"
                        className="form-input" // Use CSS class
                        required
                    />
                </div>
            </div>


            <div className="action-buttons"> {/* Use CSS class */}
              <button type="button" onClick={onBack} className="btn back-button" disabled={loading}>
                Back
              </button>
              <button type="submit" className="btn submit-button" disabled={loading || !selectedCondition}> {/* Also disable if condition is missing */}
                {loading ? <><LoadingSpinner /> Creating...</> : 'Create eBay Listing'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Define FLAW_DEFINITIONS here if not imported, needed for displaying flaw labels
const FLAW_DEFINITIONS = {
    'COVER_CREASING': { key: 'COVER_CREASING', label: 'Cover Creasing'},
    'WAVY_PAGES': { key: 'WAVY_PAGES', label: 'Wavy Pages'},
    'DIRT_RESIDUE': { key: 'DIRT_RESIDUE', label: 'Dirt Residue'},
    'INSCRIBED': { key: 'INSCRIBED', label: 'Inscribed'},
    'NOTES': { key: 'NOTES', label: 'Notes/Highlighting'},
    'WATER_DAMAGE': { key: 'WATER_DAMAGE', label: 'Water Damage'},
    'FOXING': { key: 'FOXING', label: 'Foxing'},
    'YELLOWING': { key: 'YELLOWING', label: 'Yellowing'},
    'BIND_ISSUE': { key: 'BIND_ISSUE', label: 'Binding Issue'}
};
// Simple loading spinner component
const LoadingSpinner = () => <div className="spinner" style={{ borderColor: 'rgba(0,0,0,0.1)', borderTopColor: '#333', width: '1em', height: '1em' }}></div>; // Inline style for demo


export default PriceSettingStep;