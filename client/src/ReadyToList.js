import React, { useState, useEffect } from 'react';
import './ReadyToList.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://book-listing-software.onrender.com';

// eBay rate limit configuration
// eBay allows 500 listings per 24 hours = 0.347 listings per minute
// This equals ~172.8 seconds per listing (1440 minutes / 500 listings = 2.88 minutes)
// Using 171 seconds (2.85 minutes) to optimize speed while staying safely within limits
// To change rate: Modify RATE_LIMIT_DELAY_MS below (in milliseconds)
// WARNING: Setting below 171 seconds risks exceeding eBay's 500/day limit
// NOTE: 1 per minute (60 seconds) would allow 1440 listings/day, exceeding eBay's 500/day limit
const RATE_LIMIT_DELAY_MS = 171000; // 171 seconds = 2.85 minutes between listings

function ReadyToList({ onClose, onDraftCountChange }) {
  const [drafts, setDrafts] = useState([]);
  const [selectedDrafts, setSelectedDrafts] = useState(new Set());
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, currentTitle: '' });
  const [uploadResults, setUploadResults] = useState(null);
  const [viewingImageGallery, setViewingImageGallery] = useState(null);
  const [viewingItemSpecifics, setViewingItemSpecifics] = useState(null);

  // Load drafts from server on mount
  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/drafts`);
      const data = await response.json();
      if (data.success) {
        // Fetch full draft details with images for each draft
        const fullDrafts = await Promise.all(
          data.drafts.map(async (draftSummary) => {
            const detailResponse = await fetch(`${API_BASE_URL}/api/drafts/${draftSummary.id}`);
            const detailData = await detailResponse.json();
            return detailData.success ? detailData.draft : null;
          })
        );
        const validDrafts = fullDrafts.filter(d => d !== null);
        setDrafts(validDrafts);
        if (onDraftCountChange) {
          onDraftCountChange(validDrafts.length);
        }
      }
    } catch (error) {
      console.error('Error loading drafts:', error);
    }
  };

  const handleSelectAll = () => {
    if (selectedDrafts.size === drafts.length) {
      setSelectedDrafts(new Set());
    } else {
      setSelectedDrafts(new Set(drafts.map((_, index) => index)));
    }
  };

  const handleToggleExpanded = (index) => {
    const next = new Set(expandedRows);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setExpandedRows(next);
  };

  const handleToggleSelect = (index) => {
    const newSelected = new Set(selectedDrafts);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedDrafts(newSelected);
  };

  const handleListToEbay = async () => {
    if (selectedDrafts.size === 0) {
      alert('Please select at least one listing to upload.');
      return;
    }

    const selectedIndices = Array.from(selectedDrafts).sort((a, b) => a - b);
    const draftsToUpload = selectedIndices.map(index => drafts[index]);

    setUploading(true);
    setUploadProgress({ current: 0, total: draftsToUpload.length, currentTitle: '' });
    setUploadResults(null);

    try {
      const results = [];

      for (let i = 0; i < draftsToUpload.length; i++) {
        const draft = draftsToUpload[i];
        const originalDraftId = draft.id; // Store the draft ID for later deletion
        setUploadProgress({
          current: i + 1,
          total: draftsToUpload.length,
          currentTitle: draft.listingTitle || draft.metadata?.title || 'Unknown'
        });

        try {
          // Convert base64 images back to File objects for upload
          const formData = new FormData();
          
          // Convert base64 images to blobs and append to FormData
          if (draft.imageBase64Array && draft.imageBase64Array.length > 0) {
            draft.imageBase64Array.forEach((base64Data, imgIndex) => {
              const byteString = atob(base64Data.split(',')[1]);
              const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let j = 0; j < byteString.length; j++) {
                ia[j] = byteString.charCodeAt(j);
              }
              const blob = new Blob([ab], { type: mimeString });
              const fileName = draft.imageFileNames?.[imgIndex] || `image_${imgIndex}.jpg`;
              formData.append('imageFiles', blob, fileName);
            });
          }

          // Append all other data
          formData.append('isbn', draft.isbn || '');
          formData.append('price', draft.price);
          formData.append('sku', draft.sku || '');
          formData.append('selectedCondition', draft.selectedCondition);
          formData.append('selectedFlawKeys', JSON.stringify(draft.selectedFlawKeys || []));
          formData.append('ocrText', draft.ocrText || '');

          if (draft.customTitle) {
            formData.append('customTitle', draft.customTitle);
          }
          formData.append('ebayTitle', draft.ebayTitle || '');

          formData.append('title', draft.metadata?.title || '');
          formData.append('author', draft.metadata?.author || '');
          formData.append('publisher', draft.metadata?.publisher || '');
          formData.append('publicationYear', String(draft.metadata?.publicationYear || ''));
          formData.append('synopsis', draft.metadata?.synopsis || '');
          formData.append('language', draft.metadata?.language || '');
          formData.append('format', draft.metadata?.format || draft.metadata?.binding || 'Paperback');
          formData.append('subjects', JSON.stringify(draft.metadata?.subjects || []));

          if (draft.customDescriptionNote) {
            formData.append('customDescriptionNote', draft.customDescriptionNote);
          }

          if (draft.selectedTopic) {
            formData.append('selectedTopic', draft.selectedTopic);
          }
          if (draft.selectedGenre) {
            formData.append('selectedGenre', draft.selectedGenre);
          }

          // Upload to eBay
          const response = await fetch(`${API_BASE_URL}/api/createListing`, {
            method: 'POST',
            body: formData,
          });

          const responseText = await response.text();
          let result;
          try {
            result = JSON.parse(responseText);
          } catch (e) {
            result = { success: false, error: 'Invalid response from server' };
          }

          if (result.success) {
            results.push({
              draftId: originalDraftId,
              success: true,
              listingId: result.listingId,
              url: result.ebayUrl || result.url,
              title: draft.listingTitle || draft.metadata?.title || 'Unknown'
            });
          } else {
            const errorMsg = result.error || result.message || 'Unknown error';
            results.push({
              draftId: originalDraftId,
              success: false,
              error: errorMsg,
              title: draft.listingTitle || draft.metadata?.title || 'Unknown'
            });
          }

          // Rate limiting: Using configured delay to respect eBay's 500 listings per 24 hours limit
          if (i < draftsToUpload.length - 1) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
          }
        } catch (error) {
          console.error(`Error uploading draft ${i + 1}:`, error);
          results.push({
            draftId: originalDraftId,
            success: false,
            error: error.message || 'Upload failed',
            title: draft.listingTitle || draft.metadata?.title || 'Unknown'
          });
        }
      }

      setUploadResults(results);
      
      // Remove successfully uploaded drafts from server
      const successfulDraftIds = results
        .filter(r => r.success)
        .map(r => r.draftId)
        .filter(id => id);
      
      if (successfulDraftIds.length > 0) {
        try {
          await fetch(`${API_BASE_URL}/api/drafts/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: successfulDraftIds })
          });
        } catch (error) {
          console.error('Error deleting successful drafts:', error);
        }
      }
      
      // Reload drafts to reflect deletions
      await loadDrafts();
      setSelectedDrafts(new Set());
    } catch (error) {
      console.error('Error during batch upload:', error);
      alert(`Batch upload failed: ${error.message}`);
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0, currentTitle: '' });
    }
  };

  const handleDeleteDraft = async (index) => {
    if (window.confirm('Are you sure you want to delete this draft?')) {
      const draftId = drafts[index]?.id;
      if (draftId) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/drafts/${draftId}`, {
            method: 'DELETE'
          });
          const data = await response.json();
          if (data.success) {
            await loadDrafts(); // Reload from server
            setSelectedDrafts(new Set());
          } else {
            alert('Failed to delete draft');
          }
        } catch (error) {
          console.error('Error deleting draft:', error);
          alert('Error deleting draft');
        }
      }
    }
  };

  const getFirstImageUrl = (draft) => {
    if (draft.imageBase64Array && draft.imageBase64Array.length > 0) {
      return draft.imageBase64Array[0];
    }
    if (draft.metadata?.coverUrl) {
      return draft.metadata.coverUrl;
    }
    return null;
  };

  const getItemSpecifics = (draft) => {
    return {
      title: draft.listingTitle || draft.metadata?.title || 'N/A',
      author: draft.metadata?.author || 'N/A',
      format: draft.metadata?.format || draft.metadata?.binding || 'N/A',
      condition: draft.selectedCondition || 'N/A',
      price: draft.price || 'N/A',
      isbn: draft.isbn || 'N/A',
      publisher: draft.metadata?.publisher || 'N/A',
      publicationYear: draft.metadata?.publicationYear || 'N/A',
      language: draft.metadata?.language || 'N/A',
      synopsis: draft.metadata?.synopsis || 'N/A',
      subjects: draft.metadata?.subjects || [],
      topic: draft.selectedTopic || 'N/A',
      genre: draft.selectedGenre || 'N/A',
      flaws: draft.selectedFlawKeys || []
    };
  };

  if (uploadResults) {
    return (
      <div className="ready-to-list-container">
        <div className="ready-to-list-header">
          <h2>Upload Summary</h2>
          <button onClick={() => { setUploadResults(null); onClose(); }} className="rtl-close-button">Close</button>
        </div>
        <div className="upload-summary">
          <div className="summary-stats">
            <p>Total: {uploadResults.length}</p>
            <p className="success-count">Success: {uploadResults.filter(r => r.success).length}</p>
            <p className="fail-count">Failed: {uploadResults.filter(r => !r.success).length}</p>
          </div>
          <div className="results-list">
            {uploadResults.map((result, index) => (
              <div key={index} className={`result-item ${result.success ? 'success' : 'failed'}`}>
                <div className="result-header">
                  <span className="result-status">{result.success ? '✓ Success' : '✗ Failed'}</span>
                  <span className="result-title">{result.title}</span>
                </div>
                {result.success ? (
                  <div className="result-details">
                    <p>Listing ID: {result.listingId}</p>
                    <a href={result.url} target="_blank" rel="noopener noreferrer" className="view-on-ebay-link">
                      View on eBay
                    </a>
                  </div>
                ) : (
                  <div className="result-details">
                    <p className="error-message">Error: {result.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (uploading) {
    return (
      <div className="ready-to-list-container">
        <div className="ready-to-list-header">
          <h2>Uploading to eBay</h2>
        </div>
        <div className="upload-progress">
          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            ></div>
          </div>
          <p className="progress-text">
            Uploading {uploadProgress.current} of {uploadProgress.total}
          </p>
          <p className="progress-title">{uploadProgress.currentTitle}</p>
        </div>
      </div>
    );
  }

  if (viewingImageGallery !== null) {
    const draft = drafts[viewingImageGallery];
    const images = draft?.imageBase64Array || [];
    
    return (
      <div className="image-gallery-modal">
        <div className="modal-header">
          <h3>Image Gallery</h3>
          <button onClick={() => setViewingImageGallery(null)} className="rtl-modal-close-button">×</button>
        </div>
        <div className="gallery-images">
          {images.map((img, index) => (
            <img key={index} src={img} alt={`Image ${index + 1}`} className="gallery-image" />
          ))}
        </div>
      </div>
    );
  }

  if (viewingItemSpecifics !== null) {
    const draft = drafts[viewingItemSpecifics];
    const specifics = getItemSpecifics(draft);
    
    return (
      <div className="item-specifics-modal">
        <div className="modal-header">
          <h3>Item Specifics</h3>
          <button onClick={() => setViewingItemSpecifics(null)} className="rtl-modal-close-button">×</button>
        </div>
        <div className="specifics-content">
          <div className="specifics-row">
            <strong>Title:</strong> <span>{specifics.title}</span>
          </div>
          <div className="specifics-row">
            <strong>Author:</strong> <span>{specifics.author}</span>
          </div>
          <div className="specifics-row">
            <strong>Format:</strong> <span>{specifics.format}</span>
          </div>
          <div className="specifics-row">
            <strong>Condition:</strong> <span>{specifics.condition}</span>
          </div>
          <div className="specifics-row">
            <strong>Price:</strong> <span>${specifics.price}</span>
          </div>
          <div className="specifics-row">
            <strong>ISBN:</strong> <span>{specifics.isbn}</span>
          </div>
          <div className="specifics-row">
            <strong>Publisher:</strong> <span>{specifics.publisher}</span>
          </div>
          <div className="specifics-row">
            <strong>Publication Year:</strong> <span>{specifics.publicationYear}</span>
          </div>
          <div className="specifics-row">
            <strong>Language:</strong> <span>{specifics.language}</span>
          </div>
          {specifics.topic !== 'N/A' && (
            <div className="specifics-row">
              <strong>Topic:</strong> <span>{specifics.topic}</span>
            </div>
          )}
          {specifics.genre !== 'N/A' && (
            <div className="specifics-row">
              <strong>Genre:</strong> <span>{specifics.genre}</span>
            </div>
          )}
          {specifics.flaws.length > 0 && (
            <div className="specifics-row">
              <strong>Flaws:</strong> <span>{specifics.flaws.join(', ')}</span>
            </div>
          )}
          {specifics.subjects.length > 0 && (
            <div className="specifics-row">
              <strong>Subjects:</strong> <span>{specifics.subjects.join(', ')}</span>
            </div>
          )}
          {specifics.synopsis && specifics.synopsis !== 'N/A' && (
            <div className="specifics-row">
              <strong>Synopsis:</strong> <span>{specifics.synopsis}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ready-to-list-container">
      <div className="ready-to-list-header">
        <h2>Ready to List</h2>
        <div className="header-actions">
          <button onClick={handleSelectAll} className="rtl-select-all-button">
            {selectedDrafts.size === drafts.length ? 'Deselect All' : 'Select All'}
          </button>
          <button onClick={onClose} className="rtl-close-button">Close</button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="empty-state">
          <p>No drafts ready to list. Save a draft from the price setting step to get started.</p>
        </div>
      ) : (
        <>
          <div className="drafts-table-container">
            <table className="drafts-table">
              <colgroup>
                <col style={{ width: '34px' }} />
                <col style={{ width: '44px' }} />
                <col style={{ width: '96px' }} />
                <col style={{ width: '84px' }} />
                <col />
                <col style={{ width: '160px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '88px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th aria-label="Expand" />
                  <th>Select</th>
                  <th>SKU</th>
                  <th>Image</th>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Item Specifics</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft, index) => {
                  const firstImageUrl = getFirstImageUrl(draft);
                  const titleText = draft.listingTitle || draft.metadata?.title || 'N/A';
                  const authorText = draft.metadata?.author || 'N/A';
                  const isExpanded = expandedRows.has(index);
                  return (
                    <React.Fragment key={index}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="rtl-expand-button"
                            onClick={() => handleToggleExpanded(index)}
                            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                            aria-expanded={isExpanded}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        </td>
                        <td>
                        <input
                          type="checkbox"
                          checked={selectedDrafts.has(index)}
                          onChange={() => handleToggleSelect(index)}
                        />
                      </td>
                      <td>
                        <span className="cell-truncate" title={draft.sku || 'N/A'}>
                          {draft.sku || <span className="cell-muted">N/A</span>}
                        </span>
                      </td>
                      <td>
                        {firstImageUrl ? (
                          <img
                            src={firstImageUrl}
                            alt="Book cover"
                            className="draft-thumbnail"
                            onClick={() => setViewingImageGallery(index)}
                          />
                        ) : (
                          <div className="no-image-placeholder">No Image</div>
                        )}
                      </td>
                      <td>
                        <span className="cell-truncate" title={titleText}>
                          {titleText}
                        </span>
                      </td>
                      <td>
                        <span className="cell-truncate" title={authorText}>
                          {authorText}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => setViewingItemSpecifics(index)}
                          className="rtl-view-button"
                        >
                          View
                        </button>
                      </td>
                      <td>
                        <span className="rtl-status-pill" title="Ready to list">
                          Ready
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteDraft(index)}
                          className="rtl-delete-button"
                        >
                          Delete
                        </button>
                      </td>
                      </tr>
                      {isExpanded && (
                        <tr className="rtl-expanded-row">
                          <td colSpan={9}>
                            <div className="rtl-expanded-panel">
                              <div className="rtl-expanded-grid">
                                <div>
                                  <div className="rtl-k">ISBN</div>
                                  <div className="rtl-v">{draft.isbn || 'N/A'}</div>
                                </div>
                                <div>
                                  <div className="rtl-k">Price</div>
                                  <div className="rtl-v">${draft.price || 'N/A'}</div>
                                </div>
                                <div>
                                  <div className="rtl-k">Condition</div>
                                  <div className="rtl-v">{draft.selectedCondition || 'N/A'}</div>
                                </div>
                                <div>
                                  <div className="rtl-k">Images</div>
                                  <div className="rtl-v">{draft.imageBase64Array?.length || 0}</div>
                                </div>
                              </div>
                              <div className="rtl-expanded-actions">
                                <button
                                  type="button"
                                  className="rtl-inline-link"
                                  onClick={() => setViewingImageGallery(index)}
                                >
                                  View images
                                </button>
                                <button
                                  type="button"
                                  className="rtl-inline-link"
                                  onClick={() => setViewingItemSpecifics(index)}
                                >
                                  View item specifics
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="list-actions">
            <button
              onClick={handleListToEbay}
              disabled={selectedDrafts.size === 0}
              className="rtl-list-to-ebay-button"
            >
              List to eBay ({selectedDrafts.size} selected)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ReadyToList;
