// PriceSettingStep.js
import React, { useState } from 'react';

// Define the API base URL
const API_BASE_URL = 'https://book-listing-software.onrender.com';

function PriceSettingStep({ mainImage, title, isbn, ebayTitle, onSubmit, onBack, metadata, allImages, detectedFlaws, condition, ocrText }) {
  const [price, setPrice] = useState('19.99');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      console.log('Creating listing with price:', price);
      
      // Create properly formatted image files array
      const imageFiles = allImages ? allImages.map(filename => {
        return {
          path: `/uploads/${filename}`,
          filename: filename,
          mimetype: 'image/jpeg' // assuming jpeg, this might need to be dynamic
        };
      }) : [];
      
      // Create complete request payload with all required fields
      const requestData = {
        isbn,
        price,
        mainImage,
        imageFiles,
        condition: condition || 'Good',
        flaws: detectedFlaws || { flawsDetected: false, flaws: [] },
        ocrText: ocrText || '',
        metadata: metadata
      };
      
      console.log('Sending data to createListing endpoint:', requestData);
      
      const response = await fetch(`${API_BASE_URL}/api/createListing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        credentials: 'include',
        mode: 'cors'
      });
      
      // Log response for debugging
      const responseText = await response.text();
      console.log('API response text:', responseText);
      
      if (!response.ok) {
        let errorMessage = 'Failed to create listing. Please try again.';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
        }
        throw new Error(errorMessage);
      }
      
      // Parse the response as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
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
    <div className="price-setting-container">
      <h2>Set Listing Price</h2>
      
      {error && (
        <div style={{
          padding: '12px 15px',
          marginBottom: '20px',
          borderRadius: '4px',
          background: '#ffebee',
          color: '#c62828',
          border: '1px solid #ef9a9a'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div className="book-cover">
        {mainImage && (
          <img
            src={`/uploads/${mainImage}`}
            alt="Book Cover"
            className="preview-image"
          />
        )}
      </div>
      
      <div className="book-info">
        <p><strong>ISBN:</strong> {isbn}</p>
        <p><strong>Title:</strong> {ebayTitle || title}</p>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div className="price-input">
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
          <button 
            type="button" 
            onClick={onBack} 
            className="back-button"
            disabled={loading}
          >
            Back
          </button>
          
          <button 
            type="submit" 
            className="list-button"
            disabled={loading}
          >
            {loading ? 'Creating Listing...' : 'List on eBay'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PriceSettingStep;