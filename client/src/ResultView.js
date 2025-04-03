// ResultView.js
import React from 'react';

function ResultView({ result, onReset }) {
  return (
    <div className="result-section animate-in">
      <div className="result-header">
        <h2>
          <span className="success-icon">&#x2705;</span> Listing Successfully Created
        </h2>
      </div>
      <div className="result-details">
        <div className="result-image">
          {result.mainImage && (
            <img
              src={`http://localhost:3001/uploads/${result.mainImage}`}
              alt="Main book image"
            />
          )}
        </div>
        <div className="result-data">
          <h3>{result.metadata?.title}</h3>
          <p className="author">by {result.metadata?.author}</p>
          <div className="data-grid">
            <div className="data-item">
              <span className="label">ISBN</span>
              <span className="value">{result.isbn}</span>
            </div>
            <div className="data-item">
              <span className="label">Publisher</span>
              <span className="value">{result.metadata?.publisher || 'Unknown'}</span>
            </div>
            <div className="data-item">
              <span className="label">Condition</span>
              <span className="value">{result.condition || 'Good'}</span>
            </div>
            <div className="data-item">
              <span className="label">Price</span>
              <span className="value">${result.listingResponse?.price || 'N/A'}</span>
            </div>
            <div className="data-item">
              <span className="label">Listing ID</span>
              <span className="value">{result.listingResponse?.listingId || 'Processing...'}</span>
            </div>
            {result.detectedFlaws && result.detectedFlaws.length > 0 && (
              <div className="data-item full-width">
                <span className="label">Detected Flaws</span>
                <ul className="flaws-list">
                  {result.detectedFlaws.map((flaw, index) => (
                    <li key={index}>{flaw.type}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="action-buttons">
            {result.listingResponse?.ebayUrl && (
              <a 
                href={result.listingResponse.ebayUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="view-listing-button"
              >
                View on eBay
                <span className="button-icon">&#x2197;</span>
              </a>
            )}
            <button onClick={onReset} className="new-listing-button">
              Create Another Listing
              <span className="button-icon">&#x2795;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResultView;