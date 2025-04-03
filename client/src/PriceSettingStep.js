// PriceSettingStep.js
import React, { useState } from 'react';

// Define API base URL 
const API_BASE_URL = 'https://book-listing-software.onrender.com';

function PriceSettingStep({ 
  mainImage, 
  title, 
  isbn, 
  ebayTitle, 
  onSubmit, 
  onBack, 
  metadata, 
  allImages, 
  detectedFlaws, 
  condition,
  ocrText 
}) {
  const [price, setPrice] = useState('19.99');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    console.log('Creating listing with price:', price);
    
    try {
      // Create the image files array in the format expected by the server
      const imageFiles = allImages ? allImages.map(filename => {
        return {
          path: `${process.env.NODE_ENV === 'development' ? '' : '/uploads/'}${filename}`,
          filename,
          mimetype: 'image/jpeg' // Assuming JPEG, adjust if needed
        };
      }) : [];
      
      // Prepare complete data payload matching server expectations
      const listingData = {
        isbn,
        price,
        mainImage,
        imageFiles,
        mainImageIndex: 0,
        condition: condition || 'Good',
        flaws: detectedFlaws || { flawsDetected: false, flaws: [] },
        ocrText: ocrText || '',
        // Include metadata that was returned from the processBook endpoint
        metadata
      };
      
      console.log('Sending listing data to API:', JSON.stringify(listingData, null, 2));
      
      // Make request to the API with full URL and proper options
      const response = await fetch(`${API_BASE_URL}/api/createListing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(listingData),
        credentials: 'include',
        mode: 'cors'
      });
      
      console.log('Response status:', response.status);
      
      // Get raw response text for debugging
      const responseText = await response.text();
      console.log('Raw API response:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
      
      if (!response.ok) {
        let errorMessage = 'Failed to create listing. Please try again.';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
          console.error('Server returned error:', errorData);
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
          errorMessage = responseText || `Server error: ${response.status}`;
        }
        throw new Error(errorMessage);
      }
      
      // Parse the successful response
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Listing created successfully:', data);
      } catch (parseError) {
        console.error('Error parsing successful response:', parseError);
        throw new Error('Received invalid response from server');
      }
      
      // Call the onSubmit callback with the creation result
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
            style={{
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Creating Listing...' : 'List on eBay'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PriceSettingStep;