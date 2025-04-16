// ResultView.js
import React from 'react';
import styles from './ResultView.module.css'; // Import the CSS Module

// Placeholder SVGs - Replace with your actual SVG components or icons
const CheckCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={styles.headerIcon}>
    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.06-1.06l-3.72 3.72-1.72-1.72a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z" clipRule="evenodd" />
  </svg>
);
const PlusCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
  </svg>
);
const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
    <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-1.224 1.224a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
  </svg>
);

function ResultView({ result, onReset }) {
  const {
    isbn,
    metadata,
    listingResponse,
    ebayTitle,
    condition,
  } = result || {}; // Add default empty object for safety

  const listingId = listingResponse?.listingId || 'N/A';
  const ebayUrl = listingResponse?.ebayUrl || '#';
  // Use metadata from listingResponse first if available, otherwise fallback to original
  const finalMetadata = listingResponse?.metadata || metadata || {};
  const topics = finalMetadata.topics || [];
  const genres = finalMetadata.genres || [];

  // PRIORITIZE metadata.coverUrl for the image
  const imageUrl = metadata?.coverUrl; // Only use the initial metadata URL

  return (
    <div className={styles.container}>
      {/* Success Header */}
      <div className={styles.header}>
        <CheckCircleIcon /> {/* Use actual icon component */}
        <h2 className={styles.headerTitle}>Listing Successfully Created</h2>
      </div>

      <div className={styles.content}>
        {/* Book Image */}
        <div className={styles.imageColumn}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={metadata?.title || 'Book Cover'}
              className={styles.bookImage}
            />
          ) : (
            <div className={styles.imagePlaceholder}>
              <span>No Cover Image Available</span>
            </div>
          )}
        </div>

        {/* Book Details */}
        <div className={styles.detailsColumn}>
          <h3 className={styles.bookTitle}>
            {ebayTitle || metadata?.title || 'Book Listing'}
          </h3>

          <div className={styles.detailsList}>
            <p className={styles.detailItem}>
              <span className={styles.detailLabel}>by</span>
              {metadata?.author || 'Unknown Author'}
            </p>
            <p className={styles.detailItem}>
              <span className={styles.detailLabel}>ISBN:</span>
              {isbn || 'N/A'}
            </p>
            <p className={styles.detailItem}>
              <span className={styles.detailLabel}>Publisher:</span>
              {metadata?.publisher || 'Unknown'}
            </p>
            <p className={styles.detailItem}>
              <span className={styles.detailLabel}>Condition:</span>
              {condition || 'N/A'}
            </p>
            <p className={styles.detailItem}>
              <span className={styles.detailLabel}>Listing ID:</span>
              {listingId}
            </p>
            {/* Optional SKU */}
            {/* <p className={styles.detailItem}>
              <span className={styles.detailLabel}>SKU:</span>
              {listingResponse?.sku || 'N/A'}
            </p> */}
          </div>

          {/* Genres & Topics */}
          <div className={styles.categories}>
            <div className={styles.categorySection}>
              <h4 className={styles.categoryTitle}>Genres</h4>
              <div className={styles.tagList}>
                {genres.length > 0 ? genres.map((genre, index) => (
                  <span key={index} className={styles.tag}>
                    {genre}
                  </span>
                )) : (
                  <span className={styles.noTags}>None generated</span>
                )}
              </div>
            </div>

            <div className={styles.categorySection}>
              <h4 className={styles.categoryTitle}>Topics</h4>
              <div className={styles.tagList}>
                {topics.length > 0 ? topics.map((topic, index) => (
                  <span key={index} className={styles.tag}>
                    {topic}
                  </span>
                )) : (
                  <span className={styles.noTags}>None generated</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={styles.actions}>
        <button
          onClick={onReset}
          className={`${styles.button} ${styles.buttonPrimary}`} // Combine base and specific styles
        >
          <PlusCircleIcon /> {/* Use actual icon component */}
          List Another Book
        </button>

        <a
          href={ebayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.button} ${styles.buttonSecondary}`} // Style link as a button
        >
          <ExternalLinkIcon /> {/* Use actual icon component */}
          View on eBay
        </a>
      </div>
    </div>
  );
}

export default ResultView;