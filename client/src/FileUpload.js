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

  const {
    getRootProps: getMainRootProps,
    getInputProps: getMainInputProps,
    isDragActive: isMainDragActive
  } = useDropzone({
    onDrop: onDropMain,
    accept: 'image/*',
    multiple: true
  });

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (files.mainImages.length === 0) {
      setError('Please select at least one main image');
      return;
    }

    setLoading(true);
    setError(null);

    // Create form data to send files
    const formData = new FormData();

    // Append main images
    files.mainImages.forEach(file => {
      formData.append('mainImages', file);
    });

    // Append flaw images if any
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
        <div className="upload-section">
          <h3>Main Book Images</h3>
          <p>Drag & drop clear images of the book cover and ISBN here, or click to select files</p>
          <div 
            {...getMainRootProps()} 
            style={{
              border: '2px dashed #cccccc',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <input {...getMainInputProps()} />
            {isMainDragActive ? (
              <p>Drop the main images here...</p>
            ) : (
              <p>Drag & drop files here, or click to select files</p>
            )}
          </div>
        </div>

        <div className="upload-section">
          <h3>Condition/Flaw Images (Optional)</h3>
          <p>Drag & drop images showing any flaws or condition labels here, or click to select files</p>
          <div 
            {...getFlawRootProps()} 
            style={{
              border: '2px dashed #cccccc',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <input {...getFlawInputProps()} />
            {isFlawDragActive ? (
              <p>Drop the flaw images here...</p>
            ) : (
              <p>Drag & drop files here, or click to select files</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="submit-button"
          disabled={loading || files.mainImages.length === 0}
        >
          {loading ? 'Processing...' : 'Process Book'}
        </button>
      </form>

      {/* Display selected files */}
      <div style={{ marginTop: '20px' }}>
        {/* 1) Reorderable Thumbnails for Main Images */}
        <h4>Selected Main Images (Reorderable):</h4>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="mainImages" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                style={{
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  padding: '8px 0'
                }}
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
                            userSelect: 'none',
                            margin: '0 8px 8px 0',
                            cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                            ...provided.draggableProps.style
                          }}
                        >
                          <img
                            src={previewUrl}
                            alt={file.name}
                            style={{
                              width: '100px',
                              height: 'auto',
                              display: 'block',
                              borderRadius: '4px',
                              boxShadow: snapshot.isDragging
                                ? '0 2px 8px rgba(0,0,0,0.2)'
                                : 'none'
                            }}
                          />
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

        {/* 2) Simple Thumbnails for Flaw Images (not reorderable) */}
        <h4>Selected Flaw Images:</h4>
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          padding: '8px 0'
        }}>
          {files.flawImages.map((file, index) => {
            const previewUrl = URL.createObjectURL(file);
            return (
              <div
                key={file.name + index}
                style={{
                  width: '100px',
                  position: 'relative'
                }}
              >
                <img
                  src={previewUrl}
                  alt={file.name}
                  style={{
                    width: '100px',
                    height: 'auto',
                    display: 'block',
                    borderRadius: '4px',
                    border: '1px solid #ccc'
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default FileUpload;
