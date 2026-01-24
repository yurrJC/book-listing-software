import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import './FileUpload.css'; // Import the CSS file

// Define the backend API URL (ensure this is correct)
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://book-listing-software.onrender.com';

// --- NEW: Define Conditions and Flaws on the Frontend ---
const EBAY_CONDITIONS = [
  'Brand New',
  'Like New',
  'Very Good',
  'Good',
  'Acceptable'
];

const FLAW_DEFINITIONS = {
  'COVER_CREASING': { key: 'COVER_CREASING', label: 'Cover Creasing', description: '...' }, // Descriptions are mainly for backend/review step
  'WAVY_PAGES': { key: 'WAVY_PAGES', label: 'Wavy Pages', description: '...' },
  'DIRT_RESIDUE': { key: 'DIRT_RESIDUE', label: 'Dirt Residue', description: '...' },
  'INSCRIBED': { key: 'INSCRIBED', label: 'Inscribed (Owner Markings)', description: '...' },
  'NOTES': { key: 'NOTES', label: 'Notes/Highlighting', description: '...' },
  'WATER_DAMAGE': { key: 'WATER_DAMAGE', label: 'Water Damage', description: '...' },
  'FOXING': { key: 'FOXING', label: 'Foxing', description: '...' },
  'YELLOWING': { key: 'YELLOWING', label: 'Yellowing/Age Tanning', description: '...' },
  'BIND_ISSUE': { key: 'BIND_ISSUE', label: 'Binding Issue', description: '...' },
  'CRACKED_SPINE': { key: 'CRACKED_SPINE', label: 'Cracked Spine', description: '...' },
  'WARPED': { key: 'WARPED', label: 'Warped', description: '...' },
  'DIGITAL': { key: 'DIGITAL', label: 'Digital', description: '...' }
};
// Convert to an array for easier mapping in JSX
const FLAW_OPTIONS = Object.values(FLAW_DEFINITIONS);
// --- END NEW DEFINITIONS ---

function FileUpload({ onSuccess, onOpenReadyToList, draftCount = 0 }) {
  const [files, setFiles] = useState({ mainImages: [] });
  const [selectedCondition, setSelectedCondition] = useState('Good');
  const [selectedFlaws, setSelectedFlaws] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualIsbn, setManualIsbn] = useState('');
  const [apiStatus, setApiStatus] = useState(null);
  const [flawSearchActive, setFlawSearchActive] = useState(false);
  const [flawSearchInput, setFlawSearchInput] = useState('');
  const [customDescriptionNote, setCustomDescriptionNote] = useState('');
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const flawSearchInputRef = React.useRef(null);
  const filteredFlaws = React.useMemo(() => {
    if (!flawSearchInput) return FLAW_OPTIONS;
    const input = flawSearchInput.toLowerCase();
    return FLAW_OPTIONS.filter(flaw =>
      flaw.label.toLowerCase().includes(input)
    ).sort((a, b) => {
      // Prioritize startsWith, then includes, then alphabetically
      const aStarts = a.label.toLowerCase().startsWith(input);
      const bStarts = b.label.toLowerCase().startsWith(input);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [flawSearchInput]);
  
  // Check API connectivity (remains the same)
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/status`);
        if (response.ok) {
          const data = await response.json();
          setApiStatus({ connected: true, message: data.message || 'Connected' });
        } else {
          setApiStatus({ connected: false, message: 'API Error' });
        }
      } catch (err) {
        setApiStatus({ connected: false, message: 'Cannot connect' });
      }
    };
    checkApiStatus();
  }, []);

  // Handle ISBN input change (remains the same)
  const handleIsbnChange = (e) => setManualIsbn(e.target.value);

  // Auto-copy ISBN to clipboard when scanned/entered
  useEffect(() => {
    if (manualIsbn && manualIsbn.trim().length >= 10) {
      // Copy to clipboard when ISBN is entered (assuming scanned ISBNs are at least 10 chars)
      navigator.clipboard.writeText(manualIsbn.trim()).catch(err => {
        console.warn('Failed to copy ISBN to clipboard:', err);
      });
    }
  }, [manualIsbn]);

  // Handle custom description note change
  const handleCustomDescriptionNoteChange = (e) => setCustomDescriptionNote(e.target.value);

  // Handle image modal
  const handleImageClick = (index) => {
    setSelectedImageIndex(index);
    setImageModalOpen(true);
  };

  const handleCloseModal = () => {
    setImageModalOpen(false);
    setSelectedImageIndex(null);
  };

  const handleModalBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCloseModal();
    }
  };

  const handlePreviousImage = () => {
    if (selectedImageIndex > 0) {
      setSelectedImageIndex(selectedImageIndex - 1);
    }
  };

  const handleNextImage = () => {
    if (selectedImageIndex < files.mainImages.length - 1) {
      setSelectedImageIndex(selectedImageIndex + 1);
    }
  };

  const handleKeyDown = (e) => {
    if (!imageModalOpen) return;
    
    switch (e.key) {
      case 'ArrowLeft':
        handlePreviousImage();
        break;
      case 'ArrowRight':
        handleNextImage();
        break;
      case 'Escape':
        handleCloseModal();
        break;
      default:
        break;
    }
  };

  // Add global keyboard event listener when modal is open
  useEffect(() => {
    if (imageModalOpen) {
      const handleGlobalKeyDown = (e) => {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            handlePreviousImage();
            break;
          case 'ArrowRight':
            e.preventDefault();
            handleNextImage();
            break;
          case 'Escape':
            e.preventDefault();
            handleCloseModal();
            break;
          default:
            break;
        }
      };

      document.addEventListener('keydown', handleGlobalKeyDown);
      
      // Cleanup function to remove event listener
      return () => {
        document.removeEventListener('keydown', handleGlobalKeyDown);
      };
    }
  }, [imageModalOpen, selectedImageIndex, files.mainImages.length]);

  // --- Condition Change Handler ---
  const handleConditionChange = (e) => {
    setSelectedCondition(e.target.value);
    console.log('Condition selected:', e.target.value);
  };

  // --- Flaw Toggle Handler ---
  const toggleFlaw = (flawKey) => {
    setSelectedFlaws(prevFlaws => {
      if (prevFlaws.includes(flawKey)) {
        console.log('Flaw deselected:', flawKey);
        return prevFlaws.filter(key => key !== flawKey); // Remove flaw
      } else {
        console.log('Flaw selected:', flawKey);
        return [...prevFlaws, flawKey]; // Add flaw
      }
    });
  };
  // --- End New Handlers ---

  // Drop handler for main images (remains the same)
  const onDropMain = useCallback((acceptedFiles) => {
    console.log('Main images dropped:', acceptedFiles.length);
    setFiles(prev => ({
      ...prev,
      mainImages: [...prev.mainImages, ...acceptedFiles]
    }));
  }, []);

  // --- REMOVE onDropFlaw ---

  // react-dropzone config for main images (remains the same)
  const {
    getRootProps: getMainRootProps,
    getInputProps: getMainInputProps,
    isDragActive: isMainDragActive
  } = useDropzone({
    onDrop: onDropMain,
    accept: { 'image/*': [] },
    multiple: true
  });

  // --- REMOVE react-dropzone config for flaw images ---

  // Reordering logic for main images (remains the same)
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(files.mainImages);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setFiles(prev => ({ ...prev, mainImages: reordered }));
    console.log('Images reordered');
  };

  // Delete a main image by index (remains the same)
  const handleDeleteMain = (index) => {
    setFiles(prev => {
      const updated = [...prev.mainImages];
      updated.splice(index, 1);
      console.log(`Deleted main image at index ${index}`);
      return { ...prev, mainImages: updated };
    });
  };

  // --- REMOVE handleDeleteFlaw ---

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('=== FORM SUBMISSION STARTED ===');

    if (files.mainImages.length === 0) {
      setError('Please select at least one main image');
      return;
    }

    setLoading(true);
    setError(null);

    console.log(`Condition: ${selectedCondition}`);
    console.log(`Flaws: ${JSON.stringify(selectedFlaws)}`); // Log the JSON string being sent
    console.log(`Uploading ${files.mainImages.length} main images`);

    const formData = new FormData();
    files.mainImages.forEach(file => formData.append('mainImages', file));

    // Append Condition and Flaws (as JSON string)
    formData.append('selectedCondition', selectedCondition);
    formData.append('selectedFlaws', JSON.stringify(selectedFlaws)); // Ensure it's stringified

    if (manualIsbn.trim()) {
      formData.append('manualIsbn', manualIsbn.trim());
    }

    if (customDescriptionNote.trim()) {
      formData.append('customDescriptionNote', customDescriptionNote.trim());
    }

    try {
      console.log(`Sending POST request to ${API_BASE_URL}/api/processBook`);
      const response = await fetch(`${API_BASE_URL}/api/processBook`, {
        method: 'POST',
        body: formData,
      });

      // ... (response handling remains the same) ...
      const responseText = await response.text();
      console.log('Raw response:', responseText.substring(0, 300) + (responseText.length > 300 ? '...' : ''));

      if (!response.ok) {
        // ... (error handling remains the same) ...
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('Received invalid response from server');
      }

      console.log('Processing successful, calling onSuccess callback with API data and File objects.');
      onSuccess({
        apiResponseData: data, // The JSON response from /api/processBook
        originalFileObjects: files.mainImages, // The actual File objects from state
        customDescriptionNote: customDescriptionNote // Pass the custom description note
      });
      // *** END CHANGE ***

    } catch (err) {
      console.error('Submission error:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
      console.log('=== FORM SUBMISSION COMPLETED ===');
    }
  };


  return (
    <div className="file-upload-container" style={{ position: 'relative' }}>
      {/* Ready to List Button - Always visible at top right */}
      {onOpenReadyToList && (
        <button
          onClick={onOpenReadyToList}
          className="ready-to-list-button"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
        >
          📋 Ready to List {draftCount > 0 && `(${draftCount})`}
        </button>
      )}
      
      <div className="card"> {/* Wrap content in a card */}
        <h2 className="card-title">Upload Book Details</h2>

        {/* API Status indicator */}
        {apiStatus && (
          <div className={`api-status ${apiStatus.connected ? 'connected' : 'disconnected'}`}>
            API: {apiStatus.message}
          </div>
        )}

        {/* Error message display */}
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="upload-form">

          {/* 1) MAIN IMAGES */}
          <div className="form-section">
            <h3 className="section-title">Main Book Images</h3>
            <p className="section-subtitle">Upload clear images (drag & drop or click). First image is the main listing photo.</p>

            {/* Drag & drop zone */}
            <div {...getMainRootProps()} className={`dropzone ${isMainDragActive ? 'active' : ''}`}>
              <input {...getMainInputProps()} />
              <p>Drop images here, or click to browse</p>
            </div>

            {/* Reorderable thumbnails */}
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="mainImages" direction="horizontal">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="thumbnail-gallery">
                    {files.mainImages.map((file, index) => {
                      const previewUrl = URL.createObjectURL(file); // Create URL on demand
                      return (
                        <Draggable key={file.name + index} draggableId={file.name + index} index={index}>
                          {(providedDraggable, snapshot) => (
                            <div
                              ref={providedDraggable.innerRef}
                              {...providedDraggable.draggableProps}
                              {...providedDraggable.dragHandleProps}
                              className={`thumbnail-item ${snapshot.isDragging ? 'dragging' : ''}`}
                              style={providedDraggable.draggableProps.style} // react-beautiful-dnd needs this
                              onLoad={() => URL.revokeObjectURL(previewUrl)} // Clean up URL after load
                            >
                              <img 
                                src={previewUrl} 
                                alt={file.name} 
                                className="thumbnail-image" 
                                onClick={() => handleImageClick(index)}
                                style={{ cursor: 'pointer' }}
                              />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMain(index);
                                }} 
                                className="delete-button" 
                                type="button"
                                title="Remove image"
                                aria-label="Remove image"
                              >
                                ×
                              </button>
                              {index === 0 && <span className="main-image-tag">Main</span>}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {/* Manual ISBN entry field */}
            <div className="form-group isbn-group">
              <label htmlFor="manualIsbn" className="form-label">Manual ISBN (Optional):</label>
              <input
                id="manualIsbn"
                type="text"
                value={manualIsbn}
                onChange={handleIsbnChange}
                placeholder="Enter ISBN if detection fails"
                className="form-input"
              />
              <p className="input-hint">Use this only if the ISBN isn't automatically detected from images.</p>
            </div>
          </div>

          {/* --- REMOVED FLAW IMAGES SECTION --- */}

          {/* --- 2) CONDITION SELECTION --- */}
          <div className="form-section">
             <h3 className="section-title">Select Condition</h3>
             <div className="condition-selector">
                {EBAY_CONDITIONS.map(condition => (
                    <label key={condition} className="condition-radio-label">
                        <input
                            type="radio"
                            name="condition"
                            value={condition}
                            checked={selectedCondition === condition}
                            onChange={handleConditionChange}
                            className="condition-radio-input"
                        />
                        <span className="condition-radio-text">{condition}</span>
                    </label>
                ))}
             </div>
          </div>
          {/* --- END CONDITION SELECTION --- */}


          {/* --- 3) FLAW SELECTION --- */}
          <div className="form-section">
            <h3 className="section-title">Select Flaws (if any)</h3>
            {/* Flaw Search Bar Feature */}
            <div className="flaw-search-bar-container">
              {!flawSearchActive && (
                <button
                  type="button"
                  className="flaw-search-toggle"
                  onClick={() => {
                    setFlawSearchActive(true);
                    setTimeout(() => flawSearchInputRef.current?.focus(), 0);
                  }}
                >
                  🔍 Search Flaws
                </button>
              )}
              {flawSearchActive && (
                <input
                  ref={flawSearchInputRef}
                  type="text"
                  className="flaw-search-input"
                  placeholder="Type to search flaws..."
                  value={flawSearchInput}
                  onChange={e => setFlawSearchInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const match = filteredFlaws[0];
                      if (match) toggleFlaw(match.key);
                      e.preventDefault();
                    } else if (e.key === 'Escape') {
                      setFlawSearchActive(false);
                      setFlawSearchInput('');
                    }
                  }}
                  onBlur={e => {
                    // Only close if focus moves outside the search bar and flaw buttons
                    setTimeout(() => setFlawSearchActive(false), 100);
                  }}
                />
              )}
            </div>
            <div className="flaws-grid">
              {(flawSearchActive && flawSearchInput
                ? filteredFlaws
                : FLAW_OPTIONS
              ).map(flaw => (
                <button
                  key={flaw.key}
                  type="button"
                  className={`flaw-button ${selectedFlaws.includes(flaw.key) ? 'selected' : ''}`}
                  onClick={() => toggleFlaw(flaw.key)}
                >
                  {flaw.label}
                </button>
              ))}
            </div>
            <p className="input-hint">Select all applicable flaws. Some flaws may automatically set condition to 'Acceptable'.</p>
          </div>
          {/* --- END FLAW SELECTION --- */}

          {/* --- 4) CUSTOM DESCRIPTION NOTE --- */}
          <div className="form-section">
            <h3 className="section-title">Custom Description Note (Optional)</h3>
            <div className="form-group">
              <label htmlFor="customDescriptionNote" className="form-label">Additional Note for Description:</label>
              <textarea
                id="customDescriptionNote"
                value={customDescriptionNote}
                onChange={handleCustomDescriptionNoteChange}
                placeholder="Enter any additional notes to include in the listing description..."
                className="form-textarea"
                rows="3"
                maxLength="500"
              />
              <div className="character-count">
                {customDescriptionNote.length}/500 characters
              </div>
              <p className="input-hint">This note will be added to the description above any selected flaws.</p>
            </div>
          </div>
          {/* --- END CUSTOM DESCRIPTION NOTE --- */}


          {/* Submit button */}
          <div className="form-actions">
             <button
                type="submit"
                className="submit-button primary"
                disabled={loading || files.mainImages.length === 0}
              >
                {loading ? (
                  <>
                    <LoadingSpinner /> Processing...
                  </>
                ) : 'Process Book Details'}
             </button>
          </div>

        </form>
      </div> {/* End Card */}

      {/* Image Modal */}
      {imageModalOpen && selectedImageIndex !== null && files.mainImages[selectedImageIndex] && (
        <div className="image-modal-overlay" onClick={handleModalBackdropClick}>
          <div className="image-modal-content">
            <button 
              className="image-modal-close" 
              onClick={handleCloseModal}
              aria-label="Close image"
            >
              ×
            </button>
            
            {/* Left Arrow */}
            {selectedImageIndex > 0 && (
              <button 
                className="image-modal-arrow image-modal-arrow-left" 
                onClick={handlePreviousImage}
                aria-label="Previous image"
              >
                ‹
              </button>
            )}
            
            {/* Right Arrow */}
            {selectedImageIndex < files.mainImages.length - 1 && (
              <button 
                className="image-modal-arrow image-modal-arrow-right" 
                onClick={handleNextImage}
                aria-label="Next image"
              >
                ›
              </button>
            )}
            
            <img 
              src={URL.createObjectURL(files.mainImages[selectedImageIndex])} 
              alt={`Book image ${selectedImageIndex + 1}`} 
              className="image-modal-image"
            />
            <div className="image-modal-info">
              <p>Image {selectedImageIndex + 1} of {files.mainImages.length}</p>
              {selectedImageIndex === 0 && <span className="main-image-indicator">Main Image</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple loading spinner component (can be kept or improved)
const LoadingSpinner = () => <div className="spinner"></div>;

export default FileUpload;