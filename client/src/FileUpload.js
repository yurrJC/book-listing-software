// FileUpload.js
import React, { useState, useRef, useEffect } from 'react';
import ImageGallery from './ImageGallery';
import './FileUpload.css';

function FileUpload({ onSuccess }) {  // Add onSuccess prop
  // State for the two-step process
  const [step, setStep] = useState(1); // Step 1: Main images, Step 2: Flaw images
  
  // Separate state for main and flaw images
  const [mainGalleryItems, setMainGalleryItems] = useState([]);
  const [flawGalleryItems, setFlawGalleryItems] = useState([]);
  
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [progressBarValue, setProgressBarValue] = useState(0);
  
  // Drag state
  const [mainDragActive, setMainDragActive] = useState(false);
  const [flawDragActive, setFlawDragActive] = useState(false);
  
  // Animation state
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  
  // Refs for file inputs
  const mainInputRef = useRef(null);
  const flawInputRef = useRef(null);

  // Simulate progress during upload
  useEffect(() => {
    let interval;
    if (isUploading) {
      setProgressBarValue(0);
      interval = setInterval(() => {
        setProgressBarValue(prev => {
          const newValue = prev + Math.random() * 5;
          return newValue > 90 ? 90 : newValue; // Cap at 90% until real completion
        });
      }, 200);
    } else if (progressBarValue > 0) {
      // Set to 100% when upload completes
      setProgressBarValue(100);
      clearInterval(interval);
      setTimeout(() => {
        setProgressBarValue(0);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isUploading, progressBarValue]);

  // Handle file selection for main images
  const handleMainFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const newItems = files.map(file => ({
      file,
      url: URL.createObjectURL(file)
    }));
    setMainGalleryItems(prev => [...prev, ...newItems]);
  };

  // Handle file selection for flaw images
  const handleFlawFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const newItems = files.map(file => ({
      file,
      url: URL.createObjectURL(file)
    }));
    setFlawGalleryItems(prev => [...prev, ...newItems]);
  };

  // Custom drag and drop handlers for main images
  const handleMainDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMainDragActive(true);
  };
  const handleMainDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMainDragActive(true);
  };
  const handleMainDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMainDragActive(false);
  };
  const handleMainDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMainDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    const newItems = imageFiles.map(file => ({
      file,
      url: URL.createObjectURL(file)
    }));
    setMainGalleryItems(prev => [...prev, ...newItems]);
  };

  // Custom drag and drop handlers for flaw images
  const handleFlawDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFlawDragActive(true);
  };
  const handleFlawDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFlawDragActive(true);
  };
  const handleFlawDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFlawDragActive(false);
  };
  const handleFlawDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFlawDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    const newItems = imageFiles.map(file => ({
      file,
      url: URL.createObjectURL(file)
    }));
    setFlawGalleryItems(prev => [...prev, ...newItems]);
  };

  // Set an image as the main image (for main gallery)
  const handleSetMain = (index) => {
    setMainImageIndex(index);
  };

  // Remove an image from the main gallery
  const handleRemoveMain = (index) => {
    setMainGalleryItems(prev => {
      const newItems = [...prev];
      URL.revokeObjectURL(newItems[index].url);
      newItems.splice(index, 1);
      return newItems;
    });
    if (mainImageIndex >= index && mainImageIndex > 0) {
      setMainImageIndex(mainImageIndex - 1);
    }
  };

  // Remove an image from the flaw gallery
  const handleRemoveFlaw = (index) => {
    setFlawGalleryItems(prev => {
      const newItems = [...prev];
      URL.revokeObjectURL(newItems[index].url);
      newItems.splice(index, 1);
      return newItems;
    });
  };

  // Handle reordering of main gallery images
  const handleReorderMain = (startIndex, endIndex) => {
    if (startIndex === endIndex) return;
    setMainGalleryItems(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      if (mainImageIndex === startIndex) {
        setMainImageIndex(endIndex);
      } else if (mainImageIndex > startIndex && mainImageIndex <= endIndex) {
        setMainImageIndex(mainImageIndex - 1);
      } else if (mainImageIndex < startIndex && mainImageIndex >= endIndex) {
        setMainImageIndex(mainImageIndex + 1);
      }
      return result;
    });
  };

  // Move to the flaws step
  const handleContinueToFlaws = () => {
    if (mainGalleryItems.length === 0) {
      alert("Please select at least one main image.");
      return;
    }
    document.querySelector('.file-upload-container').classList.add('step-transition');
    setTimeout(() => {
      setStep(2);
      document.querySelector('.file-upload-container').classList.remove('step-transition');
    }, 300);
  };

  // Skip the flaws step
  const handleSkipFlaws = () => {
    handleUpload([], true);
  };

  // Upload images to server
  const handleUpload = async (flawItems = flawGalleryItems, isSkipped = false) => {
    if (mainGalleryItems.length === 0) {
      alert("Please select at least one main image.");
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      mainGalleryItems.forEach(item => formData.append('mainImages', item.file));
      if (!isSkipped) {
        flawItems.forEach(item => formData.append('flawImages', item.file));
      }
      formData.append('mainImageIndex', mainImageIndex);
      const response = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      const data = await response.json();
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        
        // Instead of setting uploadResult, call onSuccess with the data
        if (onSuccess) {
          onSuccess(data);
        }
        
      }, 1000);
    } catch (error) {
      console.error('Error uploading images:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="file-upload-container">
      {/* Success Animation Overlay */}
      {showSuccessAnimation && (
        <div className="success-animation">
          <div className="checkmark-circle">
            <div className="checkmark-check"></div>
          </div>
          <div className="success-text">Processing Complete!</div>
        </div>
      )}

      {isUploading && (
        <div className="progress-bar-container">
          <div className="progress-bar-label">Uploading Images...</div>
          <div className="progress-bar">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progressBarValue}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Step 1: Main Images */}
      {step === 1 && (
        <>
          <div className="upload-section" style={{ marginBottom: '20px' }}>
            <h2>Step 1: Upload Main Book Images</h2>
            <div 
              className={`dropzone ${mainDragActive ? 'active' : ''}`}
              onDragOver={handleMainDragOver}
              onDragEnter={handleMainDragEnter}
              onDragLeave={handleMainDragLeave}
              onDrop={handleMainDrop}
              onClick={() => mainInputRef.current.click()}
            >
              <input
                ref={mainInputRef}
                type="file"
                multiple
                onChange={handleMainFileChange}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <div className="dropzone-content">
                {mainDragActive ? (
                  <div className="dropzone-active">
                    <div className="dropzone-icon">&#x2193;</div>
                    <p>Drop the images here...</p>
                  </div>
                ) : (
                  <div>
                    <div className="dropzone-icon">&#x1F4F7;</div>
                    <p>Drag &amp; drop book images here, or click to select files</p>
                    <p className="dropzone-hint">
                      Include clear images of the front cover, back cover, and ISBN.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {mainGalleryItems.length > 0 && (
            <div className="gallery-section">
              <h3>Selected Images</h3>
              <p className="hint-text">
                <span className="hint-icon">&#x1F4A1;</span> Drag and drop to reorder. The main image will be featured first in your listing.
              </p>
              <ImageGallery
                items={mainGalleryItems}
                mainIndex={mainImageIndex}
                onSetMain={handleSetMain}
                onRemove={handleRemoveMain}
                onReorder={handleReorderMain}
              />
            </div>
          )}
          
          <div className="actions-section">
            <button
              onClick={handleContinueToFlaws}
              disabled={isUploading || mainGalleryItems.length === 0}
              className={`action-button primary ${mainGalleryItems.length === 0 ? 'disabled' : ''}`}
            >
              Continue to Condition Labels
              <span className="button-icon">&#x27A1;</span>
            </button>
          </div>
        </>
      )}

      {/* Step 2: Flaw Images */}
      {step === 2 && (
        <>
          <div className="upload-section">
            <h2>Step 2: Upload Condition Label Images</h2>
            <div 
              className={`dropzone flaw-dropzone ${flawDragActive ? 'active' : ''}`}
              onDragOver={handleFlawDragOver}
              onDragEnter={handleFlawDragEnter}
              onDragLeave={handleFlawDragLeave}
              onDrop={handleFlawDrop}
              onClick={() => flawInputRef.current.click()}
            >
              <input
                ref={flawInputRef}
                type="file"
                multiple
                onChange={handleFlawFileChange}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <div className="dropzone-content">
                {flawDragActive ? (
                  <div className="dropzone-active">
                    <div className="dropzone-icon">&#x2193;</div>
                    <p>Drop the condition images here...</p>
                  </div>
                ) : (
                  <div>
                    <div className="dropzone-icon">&#x1F4CC;</div>
                    <p>Drag &amp; drop condition label images here, or click to select files</p>
                    <p className="dropzone-hint">
                      Images showing condition labels like FOXING, WATER DAMAGE, etc.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {flawGalleryItems.length > 0 && (
            <div className="gallery-section flaw-gallery">
              <h3>Selected Condition Label Images</h3>
              <ImageGallery
                items={flawGalleryItems}
                onRemove={handleRemoveFlaw}
                showMainOption={false}
              />
            </div>
          )}
          
          <div className="actions-section">
            <div className="action-buttons-row">
              <button
                onClick={() => handleUpload()}
                disabled={isUploading}
                className={`action-button primary ${isUploading ? 'disabled' : ''}`}
              >
                {isUploading ? (
                  <>
                    <span className="spinner"></span> Uploading...
                  </>
                ) : (
                  <>
                    Continue With Condition Labels
                    <span className="button-icon">&#x2714;</span>
                  </>
                )}
              </button>
              <button
                onClick={handleSkipFlaws}
                disabled={isUploading}
                className={`action-button secondary ${isUploading ? 'disabled' : ''}`}
              >
                Skip - No Condition Labels
              </button>
            </div>
            <button
              onClick={() => {
                document.querySelector('.file-upload-container').classList.add('step-transition-back');
                setTimeout(() => {
                  setStep(1);
                  document.querySelector('.file-upload-container').classList.remove('step-transition-back');
                }, 300);
              }}
              disabled={isUploading}
              className="back-button"
            >
              <span className="button-icon">&#x2190;</span> Back to Main Images
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default FileUpload;