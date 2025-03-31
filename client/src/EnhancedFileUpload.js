// EnhancedFileUpload.js
import React, { useState, useEffect } from 'react';
import ZXingScanner from './ZXingScanner';
import ImageGallery from './ImageGallery'; // Use your existing ImageGallery component

const EnhancedFileUpload = () => {
  const [galleryItems, setGalleryItems] = useState([]);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [detectedISBN, setDetectedISBN] = useState(null);
  const [currentScanIndex, setCurrentScanIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);

  // Handle file selection
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;
    
    const newItems = files.map(file => ({
      file,
      url: URL.createObjectURL(file)
    }));
    
    setGalleryItems(prevItems => [...prevItems, ...newItems]);
  };
  
  // Set an image as the main image
  const handleSetMain = (index) => {
    setMainImageIndex(index);
  };
  
  // Remove an image from the gallery
  const handleRemove = (index) => {
    setGalleryItems(prevItems => {
      const newItems = [...prevItems];
      // Revoke object URL to prevent memory leaks
      URL.revokeObjectURL(newItems[index].url);
      newItems.splice(index, 1);
      return newItems;
    });
    
    // Adjust mainImageIndex if necessary
    if (mainImageIndex >= index && mainImageIndex > 0) {
      setMainImageIndex(mainImageIndex - 1);
    }
  };
  
  // Handle barcode detection
  const handleBarcodeDetected = (isbn) => {
    console.log("ISBN detected in frontend:", isbn);
    setDetectedISBN(isbn);
    setIsScanning(false);
  };
  
  // Start scanning process for all images
  const startScanning = () => {
    if (galleryItems.length === 0) {
      alert("Please upload at least one image first.");
      return;
    }
    
    setIsScanning(true);
    setCurrentScanIndex(0);
    setDetectedISBN(null);
  };
  
  // Move to next image for scanning
  useEffect(() => {
    if (isScanning && !detectedISBN && currentScanIndex < galleryItems.length) {
      // Short delay to allow UI to update
      const timer = setTimeout(() => {
        console.log(`Scanning image ${currentScanIndex + 1}/${galleryItems.length}`);
      }, 500);
      
      return () => clearTimeout(timer);
    } else if (isScanning && currentScanIndex >= galleryItems.length) {
      setIsScanning(false);
      if (!detectedISBN) {
        alert("No ISBN barcode detected in any of the images. Please try uploading clearer images of the barcode.");
      }
    }
  }, [isScanning, currentScanIndex, galleryItems.length, detectedISBN]);
  
  // Move to next image if current one failed
  const moveToNextImage = () => {
    if (currentScanIndex < galleryItems.length - 1) {
      setCurrentScanIndex(prev => prev + 1);
    } else {
      setIsScanning(false);
    }
  };
  
  // Upload images to server with detected ISBN
  const handleUpload = async () => {
    if (galleryItems.length === 0) {
      alert("Please select at least one image.");
      return;
    }
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      
      // Append all image files
      galleryItems.forEach((item, index) => {
        formData.append('images', item.file);
        if (index === mainImageIndex) {
          formData.append('mainImageIndex', index);
        }
      });
      
      // If we detected ISBN on the client side, send it to the server
      if (detectedISBN) {
        formData.append('detectedISBN', detectedISBN);
      }
      
      // Make POST request to the server
      const response = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      setUploadResult(data);
      
    } catch (error) {
      console.error('Error uploading images:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <div className="file-upload-container">
      <div className="upload-section">
        <input 
          type="file" 
          multiple 
          onChange={handleFileChange} 
          accept="image/*" 
          disabled={isUploading || isScanning}
        />
        <p>Select multiple images of your book, including clear images of the barcode.</p>
      </div>
      
      {galleryItems.length > 0 && (
        <div className="gallery-section">
          <h3>Selected Images</h3>
          <ImageGallery 
            items={galleryItems} 
            mainIndex={mainImageIndex} 
            onSetMain={handleSetMain} 
            onRemove={handleRemove} 
          />
        </div>
      )}
      
      <div className="actions-section">
        {!detectedISBN && galleryItems.length > 0 && (
          <button 
            onClick={startScanning} 
            disabled={isUploading || isScanning}
            className="scan-button"
          >
            {isScanning ? 'Scanning...' : 'Scan for ISBN'}
          </button>
        )}
        
        <button 
          onClick={handleUpload} 
          disabled={isUploading || isScanning}
          className="upload-button"
        >
          {isUploading ? 'Uploading...' : 'Upload Listing'}
        </button>
      </div>
      
      {isScanning && (
        <div className="scanning-section">
          <h3>Scanning image {currentScanIndex + 1} of {galleryItems.length}</h3>
          <ZXingScanner 
            imageUrl={galleryItems[currentScanIndex]?.url} 
            onDetected={handleBarcodeDetected}
            onScanComplete={moveToNextImage}
          />
          <button onClick={moveToNextImage}>Skip this image</button>
        </div>
      )}
      
      {detectedISBN && (
        <div className="isbn-section">
          <h3>ISBN Detected: {detectedISBN}</h3>
        </div>
      )}
      
      {uploadResult && (
        <div className="result-section">
          <h3>Upload Result</h3>
          <div className="result-data">
            <p><strong>ISBN:</strong> {uploadResult.isbn}</p>
            <p><strong>Title:</strong> {uploadResult.metadata?.title}</p>
            <p><strong>Author:</strong> {uploadResult.metadata?.author}</p>
            <p><strong>Listing ID:</strong> {uploadResult.listingResponse?.listingId}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedFileUpload;