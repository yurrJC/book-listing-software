import React, { useState } from 'react';
import './RequiredFieldsPopup.css';

const RequiredFieldsPopup = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  missingFields, 
  currentData = {} 
}) => {
  const [formData, setFormData] = useState({
    author: currentData.author || '',
    title: currentData.title || '',
    language: currentData.language || 'English'
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleConfirm = () => {
    // Validate that all missing fields are now filled
    const stillMissing = missingFields.filter(field => {
      const fieldKey = field.toLowerCase().replace(' ', '');
      return !formData[fieldKey] || formData[fieldKey].trim() === '';
    });

    if (stillMissing.length > 0) {
      alert(`Please fill in: ${stillMissing.join(', ')}`);
      return;
    }

    onConfirm(formData);
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="popup-overlay">
      <div className="popup-content">
        <div className="popup-header">
          <h3>Missing Required Fields</h3>
          <p>eBay requires these fields to create a listing. Please provide the missing information:</p>
        </div>

        <div className="popup-body">
          {missingFields.includes('Author') && (
            <div className="field-group">
              <label htmlFor="author">Author *</label>
              <input
                id="author"
                type="text"
                value={formData.author}
                onChange={(e) => handleInputChange('author', e.target.value)}
                placeholder="Enter author name"
                className="field-input"
              />
            </div>
          )}

          {missingFields.includes('Book Title') && (
            <div className="field-group">
              <label htmlFor="title">Book Title *</label>
              <input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter book title"
                className="field-input"
              />
            </div>
          )}

          {missingFields.includes('Language') && (
            <div className="field-group">
              <label htmlFor="language">Language *</label>
              <select
                id="language"
                value={formData.language}
                onChange={(e) => handleInputChange('language', e.target.value)}
                className="field-input"
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Dutch">Dutch</option>
                <option value="Russian">Russian</option>
                <option value="Chinese">Chinese</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="Arabic">Arabic</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}
        </div>

        <div className="popup-footer">
          <button 
            type="button" 
            onClick={handleCancel}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button 
            type="button" 
            onClick={handleConfirm}
            className="btn btn-primary"
          >
            Continue with Listing
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequiredFieldsPopup;
