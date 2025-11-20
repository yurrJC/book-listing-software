/* PriceSettingStep.js */
import React, { useState, useEffect } from 'react';
import './PriceSettingStep.css';
import TopicGenreSelector from './TopicGenreSelector';
import RequiredFieldsPopup from './RequiredFieldsPopup';

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
  'BIND_ISSUE': { key: 'BIND_ISSUE', label: 'Binding Issue', description: '...' },
  'WARPED': { key: 'WARPED', label: 'Warped', description: '...' },
  'DIGITAL': { key: 'DIGITAL', label: 'Digital', description: '...' }
};
// Note: FLAW_OPTIONS is defined but not used in this component. Keep or remove as needed.
// const FLAW_OPTIONS = Object.values(FLAW_DEFINITIONS);

// Define LoadingSpinner component *outside* PriceSettingStep
const LoadingSpinner = () => (
    <div className="spinner" style={{
        border: '4px solid rgba(0, 0, 0, 0.1)',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        borderLeftColor: '#09f',
        display: 'inline-block',
        marginRight: '8px',
        verticalAlign: 'middle',
        animation: 'spin 1s linear infinite'
    }}></div>
);

// Keyframes for spinner animation (usually in CSS, but can be added via style tag or CSS-in-JS if needed)
// This is better placed in your PriceSettingStep.css file:
/*
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner { ... existing styles ... animation: spin 1s linear infinite; }
*/


// --- PriceSettingStep Component ---
function PriceSettingStep({
  onSubmit,
  onBack,
  // Data from previous step's processing (passed via parent):
  isbn,
  metadata,
  ebayTitle,
  imageFileObjects, // Receives the actual File objects
  selectedCondition, // Final condition from /processBook
  selectedFlawKeys, // Parsed array from /processBook
  ocrText,
  conditionDowngraded, // Boolean flag
  customDescriptionNote, // Custom description note from previous step
}) {
  // State declarations
  const [price, setPrice] = useState('19.99');
  const [sku, setSku] = useState('');
  const [listingTitle, setListingTitle] = useState(ebayTitle || metadata?.title || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Topic and Genre selection state
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [topicGenreSuggestions, setTopicGenreSuggestions] = useState({ topics: [], genres: [] });
  const [allValidTopics, setAllValidTopics] = useState([]);
  const [allValidGenres, setAllValidGenres] = useState([]);
  const [narrativeType, setNarrativeType] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  
  // Required fields popup state
  const [showRequiredFieldsPopup, setShowRequiredFieldsPopup] = useState(false);
  const [missingFieldsData, setMissingFieldsData] = useState(null);

  // Effect to update listing title when props change
  useEffect(() => {
    setListingTitle(ebayTitle || metadata?.title || '');
  }, [ebayTitle, metadata?.title]);

  // Effect to load topic/genre suggestions when component mounts
  useEffect(() => {
    const loadTopicGenreSuggestions = async () => {
      if (!metadata?.title) return;
      
      setSuggestionsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/getTopicGenreSuggestions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: metadata.title,
            author: metadata.author,
            synopsis: metadata.synopsis,
            subjects: metadata.subjects,
            publisher: metadata.publisher,
            format: metadata.format || metadata.binding,
            language: metadata.language,
            publicationYear: metadata.publicationYear || metadata.publishedDate
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to get suggestions');
        }

        const data = await response.json();
        if (data.success) {
          setTopicGenreSuggestions(data.suggestions);
          setAllValidTopics(data.allValidTopics);
          setAllValidGenres(data.allValidGenres);
          setNarrativeType(data.narrativeType);
        }
      } catch (error) {
        console.error('Error loading topic/genre suggestions:', error);
        setError('Failed to load topic and genre suggestions');
      } finally {
        setSuggestionsLoading(false);
      }
    };

    loadTopicGenreSuggestions();
  }, [metadata]);

  // Effect for debugging and validation of received props
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
      customDescriptionNote: customDescriptionNote || 'Not provided',
      subjects: metadata?.subjects || 'No subjects',
    });
    let currentError = null;
    if (!imageFileObjects || imageFileObjects.length === 0) {
      console.error("PriceSettingStep Critical Error: imageFileObjects prop is missing or empty!");
      currentError = "Configuration error: Image data missing. Please go back.";
    }
    if (!selectedCondition) {
      console.error("PriceSettingStep Critical Error: selectedCondition prop is missing!");
       // Append to error message if image error already exists
      currentError = (currentError ? currentError + ' ' : '') + "Configuration error: Condition data missing. Please go back.";
    }
     if (currentError) {
        setError(currentError);
     } else {
         // Clear error if props are now valid (optional, prevents sticky errors)
         // setError(null);
     }
  }, [isbn, metadata, ebayTitle, imageFileObjects, selectedCondition, selectedFlawKeys, ocrText, conditionDowngraded, customDescriptionNote]);

  // Effect for copy success message timeout
  useEffect(() => {
     let timer;
     if (copySuccess) {
        timer = setTimeout(() => setCopySuccess(false), 1500); // Hide after 1.5s
     }
     return () => clearTimeout(timer); // Cleanup timer on unmount or if copySuccess changes
  }, [copySuccess]);

  // Handler for copying ISBN
  const handleCopyISBN = () => {
    if (isbn) {
      navigator.clipboard.writeText(isbn)
        .then(() => {
          setCopySuccess(true);
        })
        .catch(err => {
          console.error('Failed to copy ISBN:', err);
          // Optionally show a user-facing error message here
        });
    }
  };

  // Handler to extract and copy "title by author" when SKU is pasted
  const extractTitleByAuthor = (titleText) => {
    if (!titleText) return '';
    
    // Find " by " in the title
    const byIndex = titleText.indexOf(' by ');
    if (byIndex === -1) return titleText.trim(); // If no " by " found, return the whole title trimmed
    
    // Extract everything up to and including " by "
    let extracted = titleText.substring(0, byIndex + 4); // +4 to include " by "
    
    // Find the rest of the string after " by "
    const afterBy = titleText.substring(byIndex + 4);
    
    // Find where the author name ends (before format words like "Hardcover", "Paperback", "Book")
    const formatWords = ['hardcover', 'paperback', 'book', 'hardback', 'softcover'];
    let authorEndIndex = afterBy.length;
    
    for (const formatWord of formatWords) {
      const formatIndex = afterBy.toLowerCase().indexOf(formatWord.toLowerCase());
      if (formatIndex !== -1 && formatIndex < authorEndIndex) {
        authorEndIndex = formatIndex;
      }
    }
    
    // Extract author name (trim any trailing spaces)
    const authorName = afterBy.substring(0, authorEndIndex).trim();
    
    // Combine title + " by " + author and trim
    return (extracted + authorName).trim();
  };

  // Handler for SKU paste event
  const handleSkuPaste = async (e) => {
    // Extract and copy title by author when SKU is pasted
    // Note: The SKU value will be updated automatically via onChange after paste
    const titleByAuthor = extractTitleByAuthor(listingTitle);
    if (titleByAuthor) {
      try {
        await navigator.clipboard.writeText(titleByAuthor);
        console.log('Copied to clipboard:', titleByAuthor);
      } catch (err) {
        console.error('Failed to copy title by author:', err);
      }
    }
  };

  // Handler for form submission to create listing
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('Starting listing creation (sending FormData)...');

    // --- Validation ---
    if (!selectedCondition) { setError("Condition is missing."); setLoading(false); return; }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) { setError("Valid price is required."); setLoading(false); return; }
    if (!listingTitle || listingTitle.trim().length === 0) { setError("Listing title is required."); setLoading(false); return; }
    if (!imageFileObjects || imageFileObjects.length === 0) {
      setError('No image files available for listing. Please go back.');
      setLoading(false);
      return;
    }
    // --- End Validation ---

    try {
      const formData = new FormData();

      // Append Image Files from props
      imageFileObjects.forEach((file, index) => {
        const fileName = file.name || `image_${index}.jpg`; // Ensure a fallback filename with extension
        // Ensure file type is provided, default if necessary (though browser usually handles this)
        const fileType = file.type || 'image/jpeg';
        formData.append('imageFiles', file, fileName);
        console.log(`Appending file: ${fileName} (Type: ${fileType}, Size: ${file.size})`);
      });

      // Append Other Data as Fields
      formData.append('isbn', isbn || '');
      formData.append('price', price);
      formData.append('sku', sku || '');
      formData.append('selectedCondition', selectedCondition);
      formData.append('selectedFlawKeys', JSON.stringify(selectedFlawKeys || []));
      formData.append('ocrText', ocrText || '');

      // Handle custom vs generated title
      if (listingTitle.trim() !== (ebayTitle || '').trim()) {
        formData.append('customTitle', listingTitle.trim());
         console.log("Using custom title:", listingTitle.trim());
      } else {
         console.log("Using generated title:", ebayTitle);
      }
      // Always send the (potentially) originally generated title too, helps backend debugging
      formData.append('ebayTitle', ebayTitle || '');

      // Append necessary metadata fields
      formData.append('title', metadata?.title || '');
      formData.append('author', metadata?.author || '');
      formData.append('publisher', metadata?.publisher || '');
      formData.append('publicationYear', String(metadata?.publishedDate || metadata?.publicationYear || '')); // Ensure string
      formData.append('synopsis', metadata?.synopsis || '');
      formData.append('language', metadata?.language || '');
      formData.append('format', metadata?.binding || metadata?.format || 'Paperback');
      formData.append('subjects', JSON.stringify(metadata?.subjects || []));

      // Append custom description note if provided
      if (customDescriptionNote && customDescriptionNote.trim()) {
        formData.append('customDescriptionNote', customDescriptionNote.trim());
        console.log("Appending custom description note:", customDescriptionNote.trim());
      }

      // Append selected topic and genre
      if (selectedTopic) {
        formData.append('selectedTopic', selectedTopic);
        console.log("✅ Appending selected topic:", selectedTopic);
      } else {
        console.log("❌ No topic selected");
      }
      if (selectedGenre) {
        formData.append('selectedGenre', selectedGenre);
        console.log("✅ Appending selected genre:", selectedGenre);
      } else {
        console.log("❌ No genre selected");
      }

      console.log('FormData prepared. Sending to /api/createListing...');
      // Log FormData fields (excluding file content)
      for (let [key, value] of formData.entries()) {
        if (!(value instanceof File)) {
           console.log(`FormData field: ${key} = ${value}`);
        } else {
           console.log(`FormData field: ${key} = [File: ${value.name}, Type: ${value.type}, Size: ${value.size}]`);
        }
      }

      // Send FormData using Fetch
      const response = await fetch(`${API_BASE_URL}/api/createListing`, {
        method: 'POST',
        body: formData,
        // Note: Content-Type is automatically set by the browser for FormData
      });

      // Process Response
      const responseText = await response.text();
      console.log(`Response Status: ${response.status}`);
      console.log('Raw Response Text:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));


      if (!response.ok) {
        let errorMessage = `Listing creation failed (Status: ${response.status})`;
        let errorData = null;
        
        try {
             errorData = JSON.parse(responseText);
             // Use more specific error from backend if available
             errorMessage = errorData.error || errorData.message || errorMessage;
             if(errorData.details) {
                // Log more details if backend provides them
                console.error("Backend error details:", errorData.details);
                // Potentially add details to the user message if appropriate
                // errorMessage += ` Details: ${JSON.stringify(errorData.details)}`;
             }
        } catch (parseErr) {
            // Could not parse JSON error response, stick with status code message
            console.warn("Could not parse error response JSON:", parseErr);
            // Include raw text snippet in error if short enough
            if (responseText.length < 200) {
                errorMessage += `: ${responseText}`;
            }
        }
        
        // Check if this is a required fields error
        if (errorData && errorData.requiresManualInput) {
          setMissingFieldsData({
            missingFields: errorData.missingFields,
            currentData: errorData.currentData
          });
          setShowRequiredFieldsPopup(true);
          setLoading(false);
          return;
        }
        
        throw new Error(errorMessage);
      }

      // Attempt to parse successful JSON response
      let data;
      try {
        data = JSON.parse(responseText);
        if (!data.success) {
            // Handle cases where backend returns 200 OK but indicates failure in JSON
            console.error("Backend indicated failure despite 200 OK:", data);
            throw new Error(data.error || 'Listing creation reported as unsuccessful by server.');
        }
        console.log('Listing creation successful:', data);
      } catch (parseErr) {
        console.error("Failed to parse successful response JSON:", parseErr);
        console.error("Raw success response text was:", responseText);
        throw new Error('Received invalid success response format from server');
      }

      onSubmit(data); // Pass success data back up

    } catch (err) {
      console.error('Error during listing creation fetch/processing:', err);
      // Display the error message from the thrown Error
      setError(err.message || 'An unknown error occurred during listing creation.');
    } finally {
      setLoading(false);
    }
  };

  // --- JSX Image Preview uses imageFileObjects ---
  const getImageUrl = () => {
    // 1. Prioritize metadata URL (usually higher quality)
    if (metadata?.coverUrl) {
      return metadata.coverUrl;
    }
    // 2. Fallback to the first uploaded image File object
    if (imageFileObjects && imageFileObjects.length > 0 && imageFileObjects[0] instanceof File) {
      // Create an object URL only if needed
      return URL.createObjectURL(imageFileObjects[0]);
    }
    // 3. No image available
    return null;
  }

  // Create the URL for the preview image
  const previewImageUrl = getImageUrl();

  // Effect to clean up object URL when component unmounts or URL changes
  useEffect(() => {
    // Check if the previewImageUrl is an object URL (starts with 'blob:')
    const isObjectURL = previewImageUrl && previewImageUrl.startsWith('blob:');

    // Return a cleanup function
    return () => {
      if (isObjectURL) {
        URL.revokeObjectURL(previewImageUrl);
        console.log("Revoked Object URL:", previewImageUrl);
      }
    };
  }, [previewImageUrl]); // Rerun effect if the previewImageUrl changes

  // Required fields popup handlers
  const handleRequiredFieldsConfirm = async (manualData) => {
    setShowRequiredFieldsPopup(false);
    setLoading(true);
    
    try {
      // Retry the listing creation with manual data
      const formData = new FormData();

      // Append Image Files from props
      imageFileObjects.forEach((file, index) => {
        const fileName = file.name || `image_${index}.jpg`;
        const fileType = file.type || 'image/jpeg';
        formData.append('imageFiles', file, fileName);
      });

      // Append Other Data as Fields with manual overrides
      formData.append('isbn', isbn || '');
      formData.append('price', price);
      formData.append('sku', sku || '');
      formData.append('selectedCondition', selectedCondition);
      formData.append('selectedFlawKeys', JSON.stringify(selectedFlawKeys || []));
      formData.append('ocrText', ocrText || '');

      // Handle custom vs generated title
      if (listingTitle.trim() !== (ebayTitle || '').trim()) {
        formData.append('customTitle', listingTitle.trim());
      }
      formData.append('ebayTitle', ebayTitle || '');

      // Append metadata fields with manual overrides
      formData.append('title', manualData.title || metadata?.title || '');
      formData.append('author', manualData.author || metadata?.author || '');
      formData.append('publisher', metadata?.publisher || '');
      formData.append('publicationYear', String(metadata?.publishedDate || metadata?.publicationYear || ''));
      formData.append('synopsis', metadata?.synopsis || '');
      formData.append('language', manualData.language || metadata?.language || '');
      formData.append('format', metadata?.binding || metadata?.format || 'Paperback');
      formData.append('subjects', JSON.stringify(metadata?.subjects || []));

      // Append custom description note if provided
      if (customDescriptionNote && customDescriptionNote.trim()) {
        formData.append('customDescriptionNote', customDescriptionNote.trim());
      }

      // Append selected topic and genre
      if (selectedTopic) {
        formData.append('selectedTopic', selectedTopic);
      }
      if (selectedGenre) {
        formData.append('selectedGenre', selectedGenre);
      }

      // Retry the request
      const response = await fetch(`${API_BASE_URL}/api/createListing`, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        throw new Error(`Listing creation failed: ${responseText}`);
      }

      const data = JSON.parse(responseText);
      onSubmit(data);
      
    } catch (err) {
      console.error('Error during retry listing creation:', err);
      setError(err.message || 'An unknown error occurred during listing creation.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequiredFieldsCancel = () => {
    setShowRequiredFieldsPopup(false);
    setMissingFieldsData(null);
  };


  // --- Component Render ---
  return (
    <div className="listing-container">
       {/* Header could go here if needed */}
       {/* Display Error Message */}
       {error && <div className="error-message"><strong>Error:</strong> {error}</div>}

       <div className="listing-content">
         {/* Left Side: Book Details & Cover */}
         <div className="book-details">
           <div className="book-cover">
              {previewImageUrl ? (
                 <img
                    src={previewImageUrl}
                    alt={metadata?.title || 'Book Cover Preview'}
                    className="preview-image"
                    // Add error handling for image loading itself
                    onError={(e) => { e.target.style.display = 'none'; /* Hide broken image */ }}
                 />
              ) : (
                 <div className="no-image">No Image Available</div>
              )}
           </div>
           <div className="book-info">
             {/* Display Title and Author */}
             <h3 className="book-title-display">{metadata?.title || 'Book Title Not Available'}</h3>
             <p className="book-author-display">by {metadata?.author || 'Unknown Author'}</p>

             {/* Display Subjects */}
             {metadata?.subjects && metadata.subjects.length > 0 ? (
               <div className="book-subjects">
                 <p className="subjects-label"><strong>Subjects:</strong></p>
                 <p className="subjects-list">{metadata.subjects.join(', ')}</p>
               </div>
             ) : (
               <div className="book-subjects no-subjects">
                 <p className="subjects-label"><strong>Subjects:</strong></p>
                 <p className="subjects-list">No subjects available</p>
               </div>
             )}

             {/* Info Table */}
             <table className="info-table">
               <tbody>
                 <tr>
                    <td><strong>ISBN:</strong></td>
                    <td>
                        {isbn || 'N/A'}
                        {isbn && <button onClick={handleCopyISBN} className="copy-button" title="Copy ISBN" disabled={!isbn}>Copy</button>}
                        {copySuccess && <span className="copy-success-msg"> Copied!</span>}
                    </td>
                 </tr>
                 <tr>
                    <td><strong>Condition:</strong></td>
                    <td>
                        {selectedCondition || <span style={{color: 'red'}}>Missing!</span>}
                        {conditionDowngraded && <span className="condition-downgraded" title="Condition was automatically set to Acceptable due to selected flaws."> (Downgraded)</span>}
                    </td>
                 </tr>
                 {/* Display Flaws only if they exist */}
                 {selectedFlawKeys && selectedFlawKeys.length > 0 && (
                   <tr>
                    <td><strong>Flaws:</strong></td>
                    <td>{selectedFlawKeys.map(key => FLAW_DEFINITIONS[key]?.label || key).join(', ')}</td>
                   </tr>
                 )}
                 {/* Display image count */}
                 <tr>
                    <td><strong>Images:</strong></td>
                    <td>{imageFileObjects ? imageFileObjects.length : 0}</td>
                 </tr>
               </tbody>
             </table>
           </div>
         </div>

         {/* Right Side: Listing Form */}
         <div className="listing-form">
             <form onSubmit={handleSubmit}>
                {/* Editable Listing Title */}
                <div className="form-group">
                    <label htmlFor="listingTitle" className="form-label">eBay Listing Title (Edit if needed):</label>
                    <input
                        id="listingTitle"
                        type="text"
                        value={listingTitle}
                        onChange={(e) => setListingTitle(e.target.value)}
                        maxLength={80}
                        className="form-input title-input"
                        required
                    />
                    <div className="character-count">{listingTitle.length}/80</div>
                </div>

                {/* SKU and Price Inputs (Side-by-side) */}
                <div className="form-row"> {/* Use CSS class for flex layout */}
                  {/* SKU Input */}
                  <div className="form-group form-group-half">
                      <label htmlFor="sku" className="form-label">SKU (Optional):</label>
                      <input
                          id="sku"
                          type="text"
                          value={sku}
                          onChange={(e) => setSku(e.target.value)}
                          onPaste={handleSkuPaste}
                          placeholder="Optional identifier"
                          className="form-input"
                      />
                  </div>

                  {/* Price Input */}
                  <div className="form-group form-group-half">
                      <label htmlFor="price" className="form-label">Price (AUD):</label>
                      <input
                          id="price"
                          type="number"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          min="0.01" // Minimum price allowed
                          step="0.01" // Allow cents
                          placeholder="e.g., 19.99"
                          className="form-input"
                          required // Price is mandatory
                      />
                  </div>
                </div>

                {/* Topic and Genre Selection */}
                {suggestionsLoading ? (
                  <div className="loading-suggestions">
                    <LoadingSpinner />
                    Loading topic and genre suggestions...
                  </div>
                ) : (
                  <TopicGenreSelector
                    onTopicSelect={setSelectedTopic}
                    onGenreSelect={setSelectedGenre}
                    initialTopic={selectedTopic}
                    initialGenre={selectedGenre}
                    suggestions={topicGenreSuggestions}
                    allValidTopics={allValidTopics}
                    allValidGenres={allValidGenres}
                    narrativeType={narrativeType}
                  />
                )}

                {/* Action Buttons */}
                <div className="action-buttons">
                    <button
                        type="button"
                        onClick={onBack}
                        className="btn back-button"
                        disabled={loading}
                    >
                        Back
                    </button>
                    <button
                        type="submit"
                        className="btn submit-button"
                        // More robust disabling condition
                        disabled={loading || !selectedCondition || !imageFileObjects || imageFileObjects.length === 0 || !listingTitle.trim() || !price || parseFloat(price) <= 0}
                    >
                       {loading ? <><LoadingSpinner /> Creating...</> : 'Create eBay Listing'}
                    </button>
                 </div>
             </form>
         </div> {/* End listing-form */}
       </div> {/* End listing-content */}
       
       {/* Required Fields Popup */}
       <RequiredFieldsPopup
         isOpen={showRequiredFieldsPopup}
         onClose={handleRequiredFieldsCancel}
         onConfirm={handleRequiredFieldsConfirm}
         missingFields={missingFieldsData?.missingFields || []}
         currentData={missingFieldsData?.currentData || {}}
       />
    </div> // End listing-container
  ); // End return
} // End PriceSettingStep component

export default PriceSettingStep;