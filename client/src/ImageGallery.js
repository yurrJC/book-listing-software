// ImageGallery.js
import React, { useState } from 'react';
import './ImageGallery.css';

function ImageGallery({ items, mainIndex = 0, onSetMain, onRemove, showMainOption = true, onReorder }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  // Only add drag handlers if onReorder is provided
  const isDraggable = !!onReorder;
  
  // Handle drag start
  const handleDragStart = (e, index) => {
    if (!isDraggable) return;
    
    setDraggedIndex(index);
    
    // Set drag data for Firefox compatibility
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
      
      // Try to set a drag image if available in this browser
      if (e.target && e.dataTransfer.setDragImage) {
        try {
          e.dataTransfer.setDragImage(e.target, 20, 20);
        } catch (err) {
          console.log("Couldn't set drag image", err);
        }
      }
    }
    
    // Add class to body for global drag state
    document.body.classList.add('dragging');
  };
  
  // Handle drag over another item
  const handleDragOver = (e, index) => {
    if (!isDraggable || draggedIndex === null) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Only update if we're moving to a different index
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };
  
  // Handle drag leaving an item
  const handleDragLeave = (e) => {
    // Only clear if we're leaving for something that's not one of our items
    // This helps prevent flickering
    if (!e.relatedTarget || !e.relatedTarget.closest('.gallery-item')) {
      setDragOverIndex(null);
    }
  };
  
  // Handle drag end
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    document.body.classList.remove('dragging');
  };
  
  // Handle drop on another item
  const handleDrop = (e, index) => {
    if (!isDraggable || draggedIndex === null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Perform the reordering
    if (draggedIndex !== index && onReorder) {
      console.log(`Reordering: ${draggedIndex} -> ${index}`);
      onReorder(draggedIndex, index);
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
    document.body.classList.remove('dragging');
  };
  
  return (
    <div className="image-gallery">
      <div className={`gallery-grid ${isDraggable ? 'draggable' : ''}`}>
        {items.map((item, index) => (
          <div 
            key={index} 
            className={`gallery-item ${index === mainIndex && showMainOption ? 'main-image' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
            draggable={isDraggable}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, index)}
            style={{
              transform: dragOverIndex === index ? 'scale(1.05)' : 'scale(1)',
              outline: dragOverIndex === index ? '2px dashed #0070ba' : 'none',
              opacity: draggedIndex === index ? 0.5 : 1,
              transition: 'transform 0.2s ease, outline 0.2s ease, opacity 0.2s ease',
            }}
          >
            <div className="image-container">
              <img
                src={item.url}
                alt={`Image ${index + 1}`}
                className="gallery-image"
              />
              
              {/* Main badge shown for the main image */}
              {index === mainIndex && showMainOption && (
                <div className="main-badge">
                  <span className="main-badge-icon">★</span> Main
                </div>
              )}
              
              {/* Drag handle for draggable items */}
              {isDraggable && (
                <div className="drag-handle">
                  ⋮⋮
                </div>
              )}
            </div>
            
            {/* Actions overlay */}
            <div className="gallery-item-actions">
              {showMainOption && index !== mainIndex && onSetMain && (
                <button
                  onClick={() => onSetMain(index)}
                  className="gallery-action set-main"
                >
                  Set as Main
                </button>
              )}
              
              {onRemove && (
                <button
                  onClick={() => onRemove(index)}
                  className="gallery-action remove"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
        
        {/* Show empty state if no items */}
        {items.length === 0 && (
          <div className="empty-gallery">
            <span>No images yet</span>
            <p>Upload images will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageGallery;