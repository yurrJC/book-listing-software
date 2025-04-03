// PriceSettingStep.js
import React, { useState } from 'react';

function PriceSettingStep({ mainImage, title, isbn, onSubmit, onBack }) {
  const [price, setPrice] = useState('19.99');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(price);
  };
  
  return (
    <div className="price-setting-container">
      <h2>Set Listing Price</h2>
      
      <div className="listing-preview">
        {mainImage && (
          <img 
            src={`/uploads/${mainImage}`} 
            alt="Book Cover" 
            className="preview-image"
          />
        )}
        
        <div className="listing-details">
          <p>ISBN: {isbn}</p>
          <p>Title: {title}</p>
        </div>
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
          <button type="button" onClick={onBack}>
            Back
          </button>
          <button type="submit">
            List on eBay
          </button>
        </div>
      </form>
    </div>
  );
}

export default PriceSettingStep;