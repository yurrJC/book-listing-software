// ResultView.js
import React from 'react';

function ResultView({ result, onReset }) {
  // Extract information from the result
  const {
    isbn,
    metadata,
    listingResponse,
    mainImage,
    ebayTitle
  } = result;

  // Get listing details
  const listingId = listingResponse?.listingId || '';
  const ebayUrl = listingResponse?.ebayUrl || '';
  const topics = listingResponse?.metadata?.topics || [];
  const genres = listingResponse?.metadata?.genres || [];
  
  return (
    <div className="result-container" style={{
      maxWidth: '800px',
      margin: '0 auto',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      overflow: 'hidden'
    }}>
      {/* Success Header */}
      <div style={{
        backgroundColor: '#4CAF50',
        color: 'white',
        padding: '20px',
        textAlign: 'center'
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <h2 style={{ margin: '10px 0' }}>Listing Successfully Created</h2>
      </div>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'row',
        padding: '20px',
        borderBottom: '1px solid #eee'
      }}>
        {/* Book Image */}
        <div style={{ flex: '0 0 200px', marginRight: '20px' }}>
          {metadata?.coverUrl ? (
            <img
              src={metadata.coverUrl}
              alt="Book Cover"
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
              }}
            />
          ) : mainImage ? (
            <img
              src={`/uploads/${mainImage}`}
              alt="Book Cover"
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '300px',
              backgroundColor: '#f5f5f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px'
            }}>
              <span>No image available</span>
            </div>
          )}
        </div>
        
        {/* Book Details */}
        <div style={{ flex: '1' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '24px', color: '#333' }}>
            {ebayTitle || metadata?.title || 'Book Listing'}
          </h3>
          
          <div style={{ marginBottom: '15px' }}>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>by</strong> {metadata?.author || 'Unknown Author'}
            </p>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>ISBN:</strong> {isbn}
            </p>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>Publisher:</strong> {metadata?.publisher || 'Unknown'}
            </p>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>Condition:</strong> {result.condition || 'Good'}
            </p>
            <p style={{ margin: '5px 0', fontSize: '16px' }}>
              <strong>Listing ID:</strong> {listingId}
            </p>
          </div>
          
          {/* Genres & Topics */}
          <div style={{ display: 'flex', marginBottom: '15px' }}>
            <div style={{ flex: '1', marginRight: '10px' }}>
              <h4 style={{ marginBottom: '8px', color: '#555' }}>Genres</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {genres && genres.length > 0 ? genres.map((genre, index) => (
                  <span key={index} style={{
                    backgroundColor: '#e3f2fd',
                    color: '#1565c0',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}>
                    {genre}
                  </span>
                )) : (
                  <span style={{ color: '#999', fontStyle: 'italic' }}>None specified</span>
                )}
              </div>
            </div>
            
            <div style={{ flex: '1' }}>
              <h4 style={{ marginBottom: '8px', color: '#555' }}>Topics</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {topics && topics.length > 0 ? topics.map((topic, index) => (
                  <span key={index} style={{
                    backgroundColor: '#f1f8e9',
                    color: '#558b2f',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}>
                    {topic}
                  </span>
                )) : (
                  <span style={{ color: '#999', fontStyle: 'italic' }}>None specified</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div style={{
        padding: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        backgroundColor: '#f9f9f9'
      }}>
        <button
          onClick={onReset}
          style={{
            backgroundColor: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          List Another Book
        </button>
        
        
        <a
          href={ebayUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            backgroundColor: '#0070ba',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          View on eBay
        </a>
      </div>
    </div>
  );
}

export default ResultView;
