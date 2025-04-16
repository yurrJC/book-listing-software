// ResultView.js
import React from 'react';

function ResultView({ result, onReset }) {
  // Extract information from the result prop
  // Assumes the parent component assembled 'result' correctly
  const {
    isbn,
    metadata, // Original metadata object
    listingResponse, // Response from /api/createListing
    ebayTitle, // Final title used in listing
    condition, // Final condition used
  } = result;

  // Get details from the listingResponse
  const listingId = listingResponse?.listingId || 'N/A';
  const ebayUrl = listingResponse?.ebayUrl || '#'; // Provide a fallback link
  const topics = listingResponse?.metadata?.topics || [];
  const genres = listingResponse?.metadata?.genres || [];

  // Determine image URL - PRIORITIZE metadata.coverUrl
  const imageUrl = metadata?.coverUrl; // Only use the metadata URL

  return (
    <div className="result-container" style={{ /* existing styles */ }}>
      {/* Success Header */}
      <div style={{ /* existing styles */ }}>
        {/* SVG and Title */}
        <svg /* ... */ ></svg>
        <h2 style={{ margin: '10px 0' }}>Listing Successfully Created</h2>
      </div>

      <div style={{ /* existing styles */ }}>
        {/* Book Image */}
        <div style={{ flex: '0 0 200px', marginRight: '20px' }}>
          {imageUrl ? ( // Use the determined imageUrl
            <img
              src={imageUrl}
              alt={metadata?.title || 'Book Cover'} // Use original title for alt
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
              }}
            />
          ) : (
            // Fallback placeholder - DO NOT use mainImage filename
            <div style={{
              width: '100%',
              paddingTop: '150%', // Maintain aspect ratio (adjust as needed)
              position: 'relative',
              backgroundColor: '#f5f5f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              color: '#999',
              fontSize: '14px',
              textAlign: 'center',
            }}>
              <span style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                No Cover Image Available
              </span>
            </div>
          )}
        </div>

        {/* Book Details */}
        <div style={{ flex: '1' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '24px', color: '#333' }}>
            {/* Display the FINAL eBay title */}
            {ebayTitle || metadata?.title || 'Book Listing'}
          </h3>

          <div style={{ marginBottom: '15px' }}>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>by</strong> {metadata?.author || 'Unknown Author'}
            </p>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>ISBN:</strong> {isbn || 'N/A'}
            </p>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>Publisher:</strong> {metadata?.publisher || 'Unknown'}
            </p>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              {/* Display the FINAL condition */}
              <strong>Condition:</strong> {condition || 'N/A'}
            </p>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>Listing ID:</strong> {listingId}
            </p>
            {/* You could add SKU here if needed: */}
            {/* <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>SKU:</strong> {listingResponse?.sku || 'N/A'}
            </p> */}
          </div>

          {/* Genres & Topics */}
          <div style={{ display: 'flex', marginBottom: '15px', gap: '20px' /* Add gap */ }}>
            <div style={{ flex: '1' }}>
              <h4 style={{ marginBottom: '8px', color: '#555' }}>Genres</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {genres.length > 0 ? genres.map((genre, index) => (
                  <span key={index} style={{ /* existing styles */ }}>
                    {genre}
                  </span>
                )) : (
                  <span style={{ color: '#999', fontStyle: 'italic' }}>None generated</span>
                )}
              </div>
            </div>

            <div style={{ flex: '1' }}>
              <h4 style={{ marginBottom: '8px', color: '#555' }}>Topics</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {topics.length > 0 ? topics.map((topic, index) => (
                  <span key={index} style={{ /* existing styles */ }}>
                    {topic}
                  </span>
                )) : (
                  <span style={{ color: '#999', fontStyle: 'italic' }}>None generated</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ /* existing styles */ }}>
        <button onClick={onReset} style={{ /* existing styles */ }}>
          {/* SVG */} <svg /* ... */ ></svg>
          List Another Book
        </button>

        <a href={ebayUrl} target="_blank" rel="noopener noreferrer" style={{ /* existing styles */ }}>
          {/* SVG */} <svg /* ... */ ></svg>
          View on eBay
        </a>
      </div>
    </div>
  );
}

export default ResultView;