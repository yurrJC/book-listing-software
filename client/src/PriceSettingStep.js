/* PriceSettingStep.js */
import React, { useState, useEffect } from 'react';
import './PriceSettingStep.css';

// Define API base URL 
const API_BASE_URL = 'https://book-listing-software.onrender.com';

function PriceSettingStep({ mainImage, title, isbn, ebayTitle, onSubmit, onBack, metadata, allImages, detectedFlaws, condition, ocrText }) {
  const [price, setPrice] = useState('19.99');
  const [sku, setSku] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Log props on component mount
  useEffect(() => {
    console.log('PriceSettingStep received props:', {
      mainImage: mainImage || 'No main image provided',
      isbn,
      title: title || 'Not provided',
      allImages: allImages ? `${allImages.length} images` : 'None',
      firstImage: allImages && allImages.length > 0 ? allImages[0] : 'No images available',
      condition: condition || 'Not specified',
      hasDetectedFlaws: detectedFlaws ? 'Yes' : 'No'
    });
  }, [mainImage, isbn, title, allImages, condition, detectedFlaws]);

  // Reset copy success message after 3 seconds
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => {
        setCopySuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  const handleCopyISBN = () => {
    if (isbn) {
      navigator.clipboard.writeText(isbn)
        .then(() => {
          setCopySuccess(true);
          console.log('ISBN copied to clipboard');
        })
        .catch(err => {
          console.error('Failed to copy ISBN:', err);
        });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    console.log('Starting listing creation with price:', price);
    console.log('SKU value:', sku);
    
    // Check if images are available
    if (!allImages || allImages.length === 0) {
      const errorMsg = 'No images available for listing. Please go back and try again.';
      console.error(errorMsg);
      setError(errorMsg);
      setLoading(false);
      return;
    }
    
    try {
      // Format image files for the server
      const imageFiles = allImages.map(filename => {
        return {
          path: `uploads/${filename}`,
          filename,
          mimetype: 'image/jpeg'
        };
      });
      
      console.log('Sending listing request with image files:', imageFiles);
      
      // Use mainImage if provided, otherwise use the first image from allImages
      const effectiveMainImage = mainImage || (allImages.length > 0 ? allImages[0] : null);
      
      // Prepare the request payload
      const requestData = {
        isbn,
        price,
        sku,
        mainImage: effectiveMainImage,
        imageFiles,
        condition: condition || 'Good',
        flaws: detectedFlaws || { flawsDetected: false, flaws: [] },
        ocrText: ocrText || ''
      };
      
      console.log('Complete request payload:', JSON.stringify(requestData, null, 2));
      
      // Send request to the server
      const response = await fetch(`${API_BASE_URL}/api/createListing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        credentials: 'include',
        mode: 'cors'
      });
      
      const responseText = await response.text();
      console.log('API response text:', responseText);
      
      if (!response.ok) {
        let errorMessage = 'Failed to create listing. Please try again.';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
        } catch (parseErr) {
          console.error('Failed to parse error response:', parseErr);
        }
        throw new Error(errorMessage);
      }
      
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Listing creation successful:', data);
      } catch (parseErr) {
        console.error('Failed to parse success response:', parseErr);
        throw new Error('Invalid response from server');
      }
      
      onSubmit(data);
    } catch (err) {
      console.error('Error creating listing:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="listing-container">
      <div className="listing-header">
        <h2>Set Listing Price</h2>
      </div>
      
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div className="listing-content">
        <div className="book-details">
          <div className="book-cover">
            {metadata?.coverUrl ? (
              <img
                src={metadata.coverUrl}
                alt="Book Cover"
                className="preview-image"
              />
            ) : mainImage ? (
              <img
                src={`/uploads/${mainImage}`}
                alt="Book Cover"
                className="preview-image"
              />
            ) : allImages && allImages.length > 0 ? (
              <img
                src={`/uploads/${allImages[0]}`}
                alt="Book Cover"
                className="preview-image"
              />
            ) : (
              <div className="no-image">No Cover Image</div>
            )}
          </div>
          
          <div className="book-info">
            <table className="info-table">
              <tbody>
                <tr>
                  <td><strong>ISBN:</strong></td>
                  <td>
                    <div className="isbn-container">
                      <span>{isbn}</span>
                      <button 
                        type="button" 
                        className="copy-button"
                        onClick={handleCopyISBN}
                        title="Copy ISBN to clipboard"
                      >
                        {copySuccess ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td><strong>Title:</strong></td>
                  <td>{ebayTitle || title}</td>
                </tr>
                <tr>
                  <td><strong>Images:</strong></td>
                  <td>{allImages ? allImages.length : 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="listing-form">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="sku">SKU:</label>
              <input
                id="sku"
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Enter SKU (optional)"
              />
            </div>
            <div className="form-group">
              <label htmlFor="price">Price (AUD):</label>
              <input
                id="price"
                type="text"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="19.99"
                required
              />
            </div>
            
            <div className="action-buttons">
              <button type="button" onClick={onBack} className="btn back-button" disabled={loading}>
                Back
              </button>
              
              <button type="submit" className="btn submit-button" disabled={loading}>
                {loading ? 'Creating Listing...' : 'List on eBay'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PriceSettingStep;
