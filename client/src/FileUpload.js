import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

// Define the backend API URL
const API_BASE_URL = 'https://book-listing-software.onrender.com';

function FileUpload({ onSuccess }) {
  const [files, setFiles] = useState({
    mainImages: [],
    flawImages: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState(null);
  const [manualIsbn, setManualIsbn] = useState('');

  // Check API connectivity on component mount
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/status`);
        console.log('API status check response:', response.status);
        if (response.ok) {
          const data = await response.json();
          setApiStatus({ connected: true, message: data.message || 'Connected to API' });
          console.log('API status:', data);
        } else {
          setApiStatus({ connected: false, message: 'API is not responding correctly' });
          console.error('API status check failed with status:', response.status);
        }
      } catch (err) {
        setApiStatus({ connected: false, message: 'Cannot connect to API' });
        console.error('API connectivity error:', err);
      }
    };

    checkApiStatus();
  }, []);

  // Handle ISBN input change
  const handleIsbnChange = (e) => {
    setManualIsbn(e.target.value);
  };

  // Drop handler for main images
  const onDropMain = useCallback((acceptedFiles) => {
    console.log('Main images dropped:', acceptedFiles.length);
    setFiles(prev => ({
      ...prev,
      mainImages: [...prev.mainImages, ...acceptedFiles]
    }));
  }, []);

  // Drop handler for flaw images
  const onDropFlaw = useCallback((acceptedFiles) => {
    console.log('Flaw images dropped:', acceptedFiles.length);
    setFiles(prev => ({
      ...prev,
      flawImages: [...prev.flawImages, ...acceptedFiles]
    }));
  }, []);

  // react-dropzone config for main images
  const {
    getRootProps: getMainRootProps,
    getInputProps: getMainInputProps,
    isDragActive: isMainDragActive
  } = useDropzone({
    onDrop: onDropMain,
    accept: {
      'image/*': []
    },
    multiple: true
  });

  // react-dropzone config for flaw images
  const {
    getRootProps: getFlawRootProps,
    getInputProps: getFlawInputProps,
    isDragActive: isFlawDragActive
  } = useDropzone({
    onDrop: onDropFlaw,
    accept: {
      'image/*': []
    },
    multiple: true
  });

  // Reordering logic for main images (react-beautiful-dnd)
  const onDragEnd = (result) => {
    if (!result.destination) return;

    const reordered = Array.from(files.mainImages);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    setFiles(prev => ({
      ...prev,
      mainImages: reordered
    }));
    console.log('Images reordered');
  };

  // Delete a main image by index
  const handleDeleteMain = (index) => {
    setFiles(prev => {
      const updated = [...prev.mainImages];
      updated.splice(index, 1);
      console.log(`Deleted main image at index ${index}`);
      return { ...prev, mainImages: updated };
    });
  };

  // Delete a flaw image by index
  const handleDeleteFlaw = (index) => {
    setFiles(prev => {
      const updated = [...prev.flawImages];
      updated.splice(index, 1);
      console.log(`Deleted flaw image at index ${index}`);
      return { ...prev, flawImages: updated };
    });
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('=== FORM SUBMISSION STARTED ===');

    if (files.mainImages.length === 0) {
      const errorMsg = 'Please select at least one main image';
      setError(errorMsg);
      console.error(errorMsg);
      return;
    }

    setLoading(true);
    setError(null);

    // Log file information for debugging
    console.log(`Uploading ${files.mainImages.length} main images and ${files.flawImages.length} flaw images`);
    files.mainImages.forEach((file, i) => {
      console.log(`Main image ${i+1}: ${file.name}, ${file.size} bytes, type: ${file.type}`);
    });

    // Create form data
    const formData = new FormData();
    
    // Append main images in their reordered order
    files.mainImages.forEach(file => {
      formData.append('mainImages', file);
    });
    
    // Append flaw images
    files.flawImages.forEach(file => {
      formData.append('flawImages', file);
    });
    
    // Add manual ISBN if provided
    if (manualIsbn.trim()) {
      formData.append('manualIsbn', manualIsbn.trim());
      console.log('Adding manual ISBN to request:', manualIsbn.trim());
    }

    try {
      console.log(`Sending POST request to ${API_BASE_URL}/api/processBook`);
      
      const response = await fetch(`${API_BASE_URL}/api/processBook`, {
        method: 'POST',
        body: formData,
        credentials: 'include', // Changed for cross-origin requests
        redirect: 'follow',
        // Add CORS headers
        mode: 'cors',
      });

      console.log(`Response received - Status: ${response.status} ${response.statusText}`);
      
      // Get the raw response text first
      const responseText = await response.text();
      console.log('Raw response:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
      
      if (!response.ok) {
        let errorMessage = 'Failed to process images';
        try {
          // Try to parse the error response as JSON
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
          console.error('Server returned error:', errorData);
        } catch (parseError) {
          // If not JSON, use the raw text or status
          console.error('Error parsing error response:', parseError);
          errorMessage = responseText || `Server error: ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      // Parse the successful response as JSON
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Successfully parsed response data:', data);
      } catch (parseError) {
        console.error('Error parsing successful response:', parseError);
        throw new Error('Received invalid response from server');
      }
      
      console.log('Processing successful, calling onSuccess callback');
      onSuccess(data);
    } catch (err) {
      const errorMsg = `Error: ${err.message}`;
      console.error('Submission error:', err);
      setError(errorMsg);
    } finally {
      setLoading(false);
      console.log('=== FORM SUBMISSION COMPLETED ===');
    }
  };

  return (
    <div className="upload-container">
      <h2>Upload Book Images</h2>
      
      {/* API Status indicator */}
      {apiStatus && (
        <div style={{
          padding: '8px 12px',
          marginBottom: '15px',
          borderRadius: '4px',
          background: apiStatus.connected ? '#e8f5e9' : '#ffebee',
          color: apiStatus.connected ? '#2e7d32' : '#c62828',
          border: `1px solid ${apiStatus.connected ? '#a5d6a7' : '#ef9a9a'}`
        }}>
          <span style={{ fontWeight: 'bold' }}>API Status:</span> {apiStatus.message}
        </div>
      )}
      
      {/* Error message display */}
      {error && (
        <div style={{
          padding: '12px 15px',
          marginBottom: '20px',
          borderRadius: '4px',
          background: '#ffebee',
          color: '#c62828',
          border: '1px solid #ef9a9a',
          fontSize: '14px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 1) MAIN IMAGES */}
        <div className="upload-section">
          <h3>Main Book Images</h3>
          <p>Drag & drop clear images here (or click), then reorder or delete below.</p>
          
          {/* Drag & drop zone for main images */}
          <div 
            {...getMainRootProps()} 
            style={dropZoneStyle(isMainDragActive)}
          >
            <input {...getMainInputProps()} />
            {isMainDragActive ? (
              <p>Drop the main images here...</p>
            ) : (
              <p>Drag & drop files here, or click to select files</p>
            )}
          </div>

          {/* Reorderable thumbnails for main images */}
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="mainImages" direction="horizontal">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={thumbsContainer}
                >
                  {files.mainImages.map((file, index) => {
                    const previewUrl = URL.createObjectURL(file);
                    return (
                      <Draggable
                        key={file.name + index}
                        draggableId={file.name + index}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              ...thumbnailWrapperStyle,
                              cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                              ...provided.draggableProps.style
                            }}
                          >
                            <img
                              src={previewUrl}
                              alt={file.name}
                              style={thumbnailStyle(snapshot.isDragging)}
                            />
                            {/* Delete button */}
                            <button
                              onClick={() => handleDeleteMain(index)}
                              style={deleteButtonStyle}
                              type="button"
                            >
                              &times;
                            </button>
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
          <div style={{ marginTop: '15px' }}>
            <label 
              htmlFor="manualIsbn" 
              style={{ 
                display: 'block', 
                marginBottom: '5px', 
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              Manual ISBN Entry (optional):
            </label>
            <input
              id="manualIsbn"
              type="text"
              value={manualIsbn}
              onChange={handleIsbnChange}
              placeholder="Enter ISBN manually if detection fails"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
            <p style={{ 
              margin: '5px 0 0', 
              fontSize: '12px', 
              color: '#666' 
            }}>
              Use this field to manually enter an ISBN if automatic detection is unsuccessful.
            </p>
          </div>
        </div>

        {/* 2) FLAW IMAGES */}
        <div className="upload-section" style={{ marginTop: '20px' }}>
          <h3>Condition/Flaw Images (Optional)</h3>
          <p>Drag & drop flaw images here (or click), then delete if needed below.</p>
          
          {/* Drag & drop zone for flaw images */}
          <div 
            {...getFlawRootProps()} 
            style={dropZoneStyle(isFlawDragActive)}
          >
            <input {...getFlawInputProps()} />
            {isFlawDragActive ? (
              <p>Drop the flaw images here...</p>
            ) : (
              <p>Drag & drop files here, or click to select files</p>
            )}
          </div>

          {/* Thumbnails for flaw images (not reorderable) */}
          <div style={thumbsContainer}>
            {files.flawImages.map((file, index) => {
              const previewUrl = URL.createObjectURL(file);
              return (
                <div key={file.name + index} style={thumbnailWrapperStyle}>
                  <img
                    src={previewUrl}
                    alt={file.name}
                    style={thumbnailStyle(false)}
                  />
                  <button
                    onClick={() => handleDeleteFlaw(index)}
                    style={deleteButtonStyle}
                    type="button"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit button with clear loading state */}
        <button
          type="submit"
          className="submit-button"
          disabled={loading || files.mainImages.length === 0}
          style={{
            marginTop: '20px',
            position: 'relative',
            backgroundColor: loading ? '#cccccc' : '#0053a0',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            minWidth: '150px',
            minHeight: '44px'
          }}
        >
          {loading ? (
            <>
              <span style={{ visibility: 'hidden' }}>Process Book</span>
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center'
              }}>
                <LoadingSpinner /> Processing...
              </div>
            </>
          ) : 'Process Book'}
        </button>
      </form>
    </div>
  );
}

// Simple loading spinner component
const LoadingSpinner = () => (
  <div style={{ 
    display: 'inline-block',
    width: '16px',
    height: '16px',
    border: '3px solid rgba(255,255,255,0.3)',
    borderRadius: '50%',
    borderTopColor: 'white',
    animation: 'spin 1s ease-in-out infinite',
    marginRight: '8px'
  }}>
    <style>
      {`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}
    </style>
  </div>
);

/* ========== Styles ========== */
const dropZoneStyle = (isActive) => ({
  border: '2px dashed #cccccc',
  borderRadius: '8px',
  padding: '20px',
  textAlign: 'center',
  marginBottom: '10px',
  cursor: 'pointer',
  backgroundColor: isActive ? '#f0f8ff' : 'transparent',
  transition: 'background-color 0.2s ease'
});

const thumbsContainer = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '8px'
};

const thumbnailWrapperStyle = {
  position: 'relative',
  border: '1px solid #eee',
  borderRadius: '4px',
  overflow: 'hidden'
};

const thumbnailStyle = (isDragging) => ({
  width: '100px',
  height: 'auto',
  borderRadius: '4px',
  boxShadow: isDragging ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
});

const deleteButtonStyle = {
  position: 'absolute',
  top: '5px',
  right: '5px',
  border: 'none',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  cursor: 'pointer',
  fontSize: '16px',
  lineHeight: '1',
  textAlign: 'center',
  padding: 0,
};

export default FileUpload;