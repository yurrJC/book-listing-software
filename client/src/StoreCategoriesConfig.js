import React, { useState } from 'react';
import './StoreCategoriesConfig.css';

function StoreCategoriesConfig({ onClose }) {
  const [config, setConfig] = useState({
    storeCategory1: '',
    storeCategory2: '',
    categoryMappings: {
      'Fiction': '',
      'Non-Fiction': '',
      'Cookbook': '',
      'Textbook': '',
      'Biography': '',
      'History': '',
      'Science': '',
      'Art': '',
      'Psychology': '',
      'Business': ''
    }
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = () => {
    setSaving(true);
    setMessage('');
    
    // Show the environment variables that need to be set
    const envVars = [
      `EBAY_STORE_CATEGORY_1=${config.storeCategory1}`,
      `EBAY_STORE_CATEGORY_2=${config.storeCategory2}`,
      ...Object.entries(config.categoryMappings).map(([key, value]) => 
        `EBAY_STORE_CATEGORY_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}=${value}`
      )
    ].filter(envVar => envVar.includes('=') && envVar.split('=')[1]);
    
    setMessage('Store categories are configured via environment variables. Please update your .env file with the following variables:\n\n' + envVars.join('\n'));
    setSaving(false);
  };

  const handleInputChange = (field, value) => {
    if (field.startsWith('mapping_')) {
      const categoryKey = field.replace('mapping_', '');
      setConfig(prev => ({
        ...prev,
        categoryMappings: {
          ...prev.categoryMappings,
          [categoryKey]: value
        }
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };


  return (
    <div className="store-categories-overlay">
      <div className="store-categories-modal">
        <div className="modal-header">
          <h2>Store Categories Configuration</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          <div className="config-section">
            <h3>Default Store Categories</h3>
            <p className="help-text">
              These categories will be automatically assigned to all listings.
              Category 1 is typically used for date-based tracking (e.g., "October 2025").
              Category 2 is typically used for genre-based organization.
            </p>
            
            <div className="input-group">
              <label htmlFor="storeCategory1">Store Category 1 (Default):</label>
              <input
                type="text"
                id="storeCategory1"
                value={config.storeCategory1}
                onChange={(e) => handleInputChange('storeCategory1', e.target.value)}
                placeholder="e.g., October 2025"
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="storeCategory2">Store Category 2 (Default):</label>
              <input
                type="text"
                id="storeCategory2"
                value={config.storeCategory2}
                onChange={(e) => handleInputChange('storeCategory2', e.target.value)}
                placeholder="e.g., Fiction"
              />
            </div>
          </div>

          <div className="config-section">
            <h3>Automatic Category Assignment</h3>
            <p className="help-text">
              Configure which Store Category 2 ID to use for different book types.
              The system will automatically assign the appropriate category based on the book's content.
            </p>
            
            <div className="mapping-grid">
              {Object.entries(config.categoryMappings).map(([category, value]) => (
                <div key={category} className="mapping-item">
                  <label htmlFor={`mapping_${category}`}>{category}:</label>
                  <input
                    type="text"
                    id={`mapping_${category}`}
                    value={value}
                    onChange={(e) => handleInputChange(`mapping_${category}`, e.target.value)}
                    placeholder="Store Category ID"
                  />
                </div>
              ))}
            </div>
          </div>

          {message && (
            <div className="message">
              <pre>{message}</pre>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button 
            className="save-button" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button className="cancel-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default StoreCategoriesConfig;
