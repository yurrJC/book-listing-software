/* PriceSettingStep.js */
import React, { useState, useEffect } from 'react';
import './PriceSettingStep.css';

// Define API base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://book-listing-software.onrender.com';

const FLAW_DEFINITIONS = {
  'COVER_CREASING': { key: 'COVER_CREASING', label: 'Cover Creasing', description: '...' },
  'WAVY_PAGES': { key: 'WAVY_PAGES', label: 'Wavy Pages', description: '...' },
  'DIRT_RESIDUE': { key: 'DIRT_RESIDUE', label: 'Dirt Residue', description: '...' },
  'INSCRIBED': { key: 'INSCRIBED', label: 'Inscribed (Owner Markings)', description: '...' },
  'NOTES': { key: 'NOTES', label: 'Notes/Highlighting', description: '...' },
  'WATER_DAMAGE': { key: 'WATER_DAMAGE', label: 'Water Damage', description: '...' },
  'FOXING': { key: 'FOXING', label: 'Foxing', description: '...' },
  'YELLOWING': { key: 'YELLOWING', label: 'Yellowing/Age Tanning', description: '...' },
  'BIND_ISSUE': { key: 'BIND_ISSUE', label: 'Binding Issue', description: '...' }
};
const FLAW_OPTIONS = Object.values(FLAW_DEFINITIONS);

// --- Prop List Including File Objects ---
function PriceSettingStep({
  onSubmit,
  onBack,
  // Data from previous step's processing (passed via parent):
  isbn,
  metadata,
  ebayTitle,
  imageFileObjects, // *** Now receives the actual File objects ***
  selectedCondition, // Final condition from /processBook
  selectedFlawKeys, // Parsed array from /processBook
  ocrText,
  conditionDowngraded, // Boolean flag
}) {
  // State remains the same
  const [price, setPrice] = useState('19.99');
  const [sku, setSku] = useState('');
  const [listingTitle, setListingTitle] = useState(ebayTitle || metadata?.title || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setListingTitle(ebayTitle || metadata?.title || '');
  }, [ebayTitle, metadata?.title]);

  // Debugging useEffect (checks imageFileObjects correctly now)
  useEffect(() => {
    console.log('PriceSettingStep received props:', {
      isbn,
      metadataExists: !!metadata,
      ebayTitle: ebayTitle || 'Not provided',
      imageFileObjectsCount: imageFileObjects ? imageFileObjects.length : 'Not provided!',
      selectedCondition: selectedCondition || 'Not provided!',
      selectedFlawKeys: selectedFlawKeys || 'Not provided!',
      ocrTextLength: ocrText ? ocrText.length : 0,
      conditionDowngraded: conditionDowngraded,
    });
    if (!imageFileObjects || imageFileObjects.length === 0) {
      console.error("PriceSettingStep Critical Error: imageFileObjects prop is missing or empty!");
      setError("Configuration error: Image data missing. Please go back.");
    }
    if (!selectedCondition) {
      console.error("PriceSettingStep Critical Error: selectedCondition prop is missing!");
      setError("Configuration error: Condition data missing. Please go back.");
    }
  }, [isbn, metadata, ebayTitle, imageFileObjects, selectedCondition, selectedFlawKeys, ocrText, conditionDowngraded]);

  // Copy Success Timer (no change)
  useEffect(() => { /* ... */ }, [copySuccess]);
  const handleCopyISBN = () => { /* ... */ };

  // --- handleSubmit uses FormData and imageFileObjects ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('Starting listing creation (sending FormData)...');

    // --- Validation ---
    if (!selectedCondition) { setError("Condition is missing."); setLoading(false); return; }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) { setError("Valid price is required."); setLoading(false); return; }
    if (!listingTitle || listingTitle.trim().length === 0) { setError("Listing title is required."); setLoading(false); return; }
    // *** Use imageFileObjects for validation ***
    if (!imageFileObjects || imageFileObjects.length === 0) {
      setError('No image files available for listing. Please go back.');
      setLoading(false);
      return;
    }
    // --- End Validation ---

    try {
      const formData = new FormData();

      // *** Append Image Files from props ***
      imageFileObjects.forEach((file, index) => {
        // Use the original file name if available, otherwise generate one
        const fileName = file.name || `image_${index}`;
        formData.append('imageFiles', file, fileName);
        console.log(`Appending file: ${fileName} (Type: ${file.type}, Size: ${file.size})`);
      });

      // *** Append Other Data as Fields ***
      formData.append('isbn', isbn || '');
      formData.append('price', price);
      formData.append('sku', sku || ''); // Backend handles empty string okay
      formData.append('selectedCondition', selectedCondition); // Send the final condition
      formData.append('selectedFlawKeys', JSON.stringify(selectedFlawKeys || [])); // Stringify flaws
      formData.append('ocrText', ocrText || '');

      // Add custom title ONLY if it differs from the auto-generated one
      if (listingTitle !== ebayTitle) {
        formData.append('customTitle', listingTitle);
      }
      // Always send the originally generated title too, backend might prefer it
      formData.append('ebayTitle', ebayTitle || '');

      // Add necessary metadata fields required by backend
      formData.append('title', metadata?.title || '');
      formData.append('author', metadata?.author || '');
      formData.append('publisher', metadata?.publisher || '');
      // Ensure publicationYear is sent if available, even if just a year string
      formData.append('publicationYear', metadata?.publishedDate || metadata?.publicationYear || '');
      formData.append('synopsis', metadata?.synopsis || '');
      formData.append('language', metadata?.language || '');
      // Send format/binding from metadata
      formData.append('format', metadata?.binding || metadata?.format || 'Paperback');
      formData.append('subjects', JSON.stringify(metadata?.subjects || []));

      console.log('FormData prepared. Sending to /api/createListing...');
      for (let key of formData.keys()) {
        // Don't log file content, just keys and maybe non-file values
        if (key !== 'imageFiles') {
           console.log(`FormData field: ${key} = ${formData.get(key)}`);
        } else {
           console.log(`FormData key: ${key} (contains file data)`);
        }
      }

      // Send FormData using Fetch (no changes needed here)
      const response = await fetch(`${API_BASE_URL}/api/createListing`, {
        method: 'POST',
        body: formData,
      });

      // Process Response (no changes needed here)
      const responseText = await response.text();
      // ... (rest of response processing) ...

      if (!response.ok) {
         // ... error handling ...
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Listing creation successful:', data);
      } catch (parseErr) {
         // ... parse error handling ...
        throw new Error('Received invalid success response from server');
      }

      onSubmit(data); // Pass success data back up (contains listingResponse details)

    } catch (err) {
      console.error('Error during listing creation fetch:', err);
      setError(err.message || 'An unknown error occurred during listing creation.');
    } finally {
      setLoading(false);
    }
  };

  // --- JSX Image Preview uses imageFileObjects ---
  const getImageUrl = () => {
    if (metadata?.coverUrl) { // Prioritize metadata URL
      return metadata.coverUrl;
    }
    // *** Use imageFileObjects for preview ***
    if (imageFileObjects && imageFileObjects.length > 0) {
      return URL.createObjectURL(imageFileObjects[0]);
    }
    return null;
  }

  const previewImageUrl = getImageUrl();

  // Clean up object URL (no change needed here)
  useEffect(() => {
    // ... (URL cleanup logic remains the same) ...
  }, [previewImageUrl]);

  return (
    <div className="listing-container">
       {/* ... header ... */}
       {error && <div className="error-message"><strong>Error:</strong> {error}</div>}
       <div className="listing-content">
         <div className="book-details">
           <div className="book-cover">
              {previewImageUrl ? (
                 <img src={previewImageUrl} alt={metadata?.title || 'Book Cover Preview'} className="preview-image"/>
              ) : (
                 <div className="no-image">No Image</div>
              )}
           </div>
           <div className="book-info">
             {/* ... title, author ... */}
             <table className="info-table">
               <tbody>
                 <tr><td><strong>ISBN:</strong></td><td>{isbn || 'N/A'} <button onClick={handleCopyISBN} disabled={!isbn}>Copy</button>{copySuccess && ' Copied!'}</td></tr>
                 <tr><td><strong>Condition:</strong></td><td>{selectedCondition || <span style={{color: 'red'}}>Missing!</span>} {conditionDowngraded && <span style={{color: 'orange', fontWeight:'bold'}}>(Downgraded)</span>}</td></tr>
                 {selectedFlawKeys && selectedFlawKeys.length > 0 && (
                   <tr><td><strong>Flaws:</strong></td><td>{selectedFlawKeys.map(key => FLAW_DEFINITIONS[key]?.label || key).join(', ')}</td></tr>
                 )}
                 {/* Display image count from the actual File objects */}
                 <tr><td><strong>Images:</strong></td><td>{imageFileObjects ? imageFileObjects.length : 0}</td></tr>
               </tbody>
             </table>
           </div>
         </div>

         <div className="listing-form">
             {/* Form inputs remain largely the same */}
             <form onSubmit={handleSubmit}>
                {/* Title */}
                <div className="form-group">
                    <label htmlFor="listingTitle" className="form-label">eBay Listing Title (Edit if needed):</label>
                    <input id="listingTitle" type="text" value={listingTitle} onChange={(e) => setListingTitle(e.target.value)} maxLength={80} className="form-input title-input" required/>
                    <div className="character-count">{listingTitle.length}/80</div>
                </div>
                {/* SKU / Price */}
                 {/* ... sku/price inputs ... */}
                 {/* Actions */}
                 <div className="action-buttons">
                    <button type="button" onClick={onBack} className="btn back-button" disabled={loading}>Back</button>
                    {/* Disable button if critical data is missing */}
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

const LoadingSpinner = () => <div className="spinner" style={{ /* ... */ }}></div>;

export default PriceSettingStep;