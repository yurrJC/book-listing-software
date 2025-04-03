// FileUpload.js
import React, { useState } from 'react';

function FileUpload({ onSuccess }) {
  const [files, setFiles] = useState({
    mainImages: [],
    flawImages: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const { name, files: fileList } = e.target;
    setFiles(prev => ({
      ...prev,
      [name]: Array.from(fileList)
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
      // Send to a process-only endpoint (not creating eBay listing yet)
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
          <p>Upload clear images of the book cover and ISBN</p>
          <input 
            type="file" 
            name="mainImages" 
            onChange={handleFileChange} 
            multiple 
            accept="image/*" 
          />
        </div>
        
        <div className="upload-section">
          <h3>Condition/Flaw Images (Optional)</h3>
          <p>Upload images showing any flaws or condition labels</p>
          <input 
            type="file" 
            name="flawImages" 
            onChange={handleFileChange} 
            multiple 
            accept="image/*" 
          />
        </div>
        
        <button 
          type="submit" 
          className="submit-button" 
          disabled={loading || files.mainImages.length === 0}
        >
          {loading ? 'Processing...' : 'Process Book'}
        </button>
      </form>
    </div>
  );
}

export default FileUpload;