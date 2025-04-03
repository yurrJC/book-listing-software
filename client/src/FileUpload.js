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

  const { getRootProps: getMainRootProps, getInputProps: getMainInputProps, isDragActive: isMainDragActive } = useDropzone({
    onDrop: onDropMain,
    accept: 'image/*',
    multiple: true
  });

  const { getRootProps: getFlawRootProps, getInputProps: getFlawInputProps, isDragActive: isFlawDragActive } = useDropzone({
    onDrop: onDropFlaw,
    accept: 'image/*',
    multiple: true
  });

  // Handle reordering of main images using react-beautiful-dnd
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

    // Append main images (in their reordered order)
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

      {/* Display selected files with reordering for main images */}
      <div style={{ marginTop: '20px' }}>
        <h4>Selected Main Images (Reorderable):</h4>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="mainImages">
            {(provided) => (
              <ul 
                ref={provided.innerRef}
                {...provided.droppableProps}
                style={{ listStyleType: 'none', padding: 0 }}
              >
                {files.mainImages.map((file, index) => (
                  <Draggable key={index} draggableId={`main-${index}`} index={index}>
                    {(provided, snapshot) => (
                      <li
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        style={{
                          userSelect: 'none',
                          padding: '8px',
                          margin: '0 0 8px 0',
                          background: snapshot.isDragging ? '#e0e0e0' : '#fff',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                          ...provided.draggableProps.style
                        }}
                      >
                        {file.name}
                      </li>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </ul>
            )}
          </Droppable>
        </DragDropContext>

        <h4>Selected Flaw Images:</h4>
        <ul style={{ listStyleType: 'none', padding: 0 }}>
          {files.flawImages.map((file, index) => (
            <li key={index} style={{
              padding: '8px',
              margin: '0 0 8px 0',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}>
              {file.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default FileUpload;
