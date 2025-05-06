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
  'CRACKED_SPINE': { key: 'CRACKED_SPINE', label: 'Cracked Spine', description: '...' } // Add new flaw
};
// Convert to an array for easier mapping in JSX
const FLAW_OPTIONS = Object.values(FLAW_DEFINITIONS);
// --- END NEW DEFINITIONS ---

function FileUpload({ onSuccess }) {
  const [files, setFiles] = useState({ mainImages: [] });
  const [selectedCondition, setSelectedCondition] = useState('Good');
  const [selectedFlaws, setSelectedFlaws] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualIsbn, setManualIsbn] = useState('');
  const [apiStatus, setApiStatus] = useState(null);
  
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
        originalFileObjects: files.mainImages // The actual File objects from state
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
    <div className="file-upload-container">
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
                              <img src={previewUrl} alt={file.name} className="thumbnail-image" />
                              <button onClick={() => handleDeleteMain(index)} className="delete-button" type="button">×</button>
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
            <div className="flaws-grid">
          {FLAW_OPTIONS.map(flaw => (
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
    </div>
  );
}

// Simple loading spinner component (can be kept or improved)
const LoadingSpinner = () => <div className="spinner"></div>;

export default FileUpload;