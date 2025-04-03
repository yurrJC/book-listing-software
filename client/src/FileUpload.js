import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

function FileUpload({ onSuccess }) {
  const [files, setFiles] = useState({
    mainImages: [],
    flawImages: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Drop handler for main images
  const onDropMain = useCallback((acceptedFiles) => {
    setFiles(prev => ({
      ...prev,
      mainImages: [...prev.mainImages, ...acceptedFiles]
    }));
  }, []);

  // Drop handler for flaw images
  const onDropFlaw = useCallback((acceptedFiles) => {
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
    accept: 'image/*',
    multiple: true
  });

  // react-dropzone config for flaw images
  const {
    getRootProps: getFlawRootProps,
    getInputProps: getFlawInputProps,
    isDragActive: isFlawDragActive
  } = useDropzone({
    onDrop: onDropFlaw,
    accept: 'image/*',
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
  };

  // Delete a main image by index
  const handleDeleteMain = (index) => {
    setFiles(prev => {
      const updated = [...prev.mainImages];
      updated.splice(index, 1);
      return { ...prev, mainImages: updated };
    });
  };

  // Delete a flaw image by index
  const handleDeleteFlaw = (index) => {
    setFiles(prev => {
      const updated = [...prev.flawImages];
      updated.splice(index, 1);
      return { ...prev, flawImages: updated };
    });
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (files.mainImages.length === 0) {
      setError('Please select at least one main image');
      return;
    }

    setLoading(true);
    setError(null);

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

    try {
      const response = await fetch('/api/processBook', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process images');
      }

      const data = await response.json();
      onSuccess(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-container">
      <h2>Upload Book Images</h2>
      {error && <div className="error-message">{error}</div>}

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

        <button
          type="submit"
          className="submit-button"
          disabled={loading || files.mainImages.length === 0}
          style={{ marginTop: '20px' }}
        >
          {loading ? 'Processing...' : 'Process Book'}
        </button>
      </form>
    </div>
  );
}

/* ========== Inline Styles for convenience ========== */
const dropZoneStyle = (isActive) => ({
  border: '2px dashed #cccccc',
  borderRadius: '8px',
  padding: '20px',
  textAlign: 'center',
  marginBottom: '10px',
  cursor: 'pointer',
  backgroundColor: isActive ? '#f0f8ff' : 'transparent'
});

const thumbsContainer = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '8px'
};

const thumbnailWrapperStyle = {
  position: 'relative',
};

const thumbnailStyle = (isDragging) => ({
  width: '100px',
  height: 'auto',
  borderRadius: '4px',
  boxShadow: isDragging ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
});

const deleteButtonStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  border: 'none',
  background: 'rgba(0,0,0,0.5)',
  color: '#fff',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  cursor: 'pointer',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'center',
  padding: 0,
};

export default FileUpload;
