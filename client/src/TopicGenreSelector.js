import React, { useState, useEffect, useRef } from 'react';
import './TopicGenreSelector.css';

const TopicGenreSelector = ({ 
  onTopicSelect, 
  onGenreSelect, 
  initialTopic = '', 
  initialGenre = '',
  suggestions = { topics: [], genres: [] },
  allValidTopics = [],
  allValidGenres = [],
  narrativeType = ''
}) => {
  const [selectedTopic, setSelectedTopic] = useState(initialTopic);
  const [selectedGenre, setSelectedGenre] = useState(initialGenre);
  const [topicSearch, setTopicSearch] = useState('');
  const [genreSearch, setGenreSearch] = useState('');
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [filteredTopics, setFilteredTopics] = useState([]);
  const [filteredGenres, setFilteredGenres] = useState([]);

  const topicDropdownRef = useRef(null);
  const genreDropdownRef = useRef(null);

  // Filter topics based on search
  useEffect(() => {
    if (topicSearch.trim() === '') {
      setFilteredTopics([]);
    } else {
      const filtered = allValidTopics.filter(topic =>
        topic.toLowerCase().includes(topicSearch.toLowerCase())
      ).slice(0, 20); // Limit to 20 results for performance
      setFilteredTopics(filtered);
    }
  }, [topicSearch, allValidTopics]);

  // Filter genres based on search
  useEffect(() => {
    if (genreSearch.trim() === '') {
      setFilteredGenres([]);
    } else {
      const filtered = allValidGenres.filter(genre =>
        genre.toLowerCase().includes(genreSearch.toLowerCase())
      ).slice(0, 20); // Limit to 20 results for performance
      setFilteredGenres(filtered);
    }
  }, [genreSearch, allValidGenres]);

  // Handle clicks outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (topicDropdownRef.current && !topicDropdownRef.current.contains(event.target)) {
        setShowTopicDropdown(false);
      }
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(event.target)) {
        setShowGenreDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTopicSelect = (topic) => {
    setSelectedTopic(topic);
    setTopicSearch(topic);
    setShowTopicDropdown(false);
    onTopicSelect(topic);
  };

  const handleGenreSelect = (genre) => {
    setSelectedGenre(genre);
    setGenreSearch(genre);
    setShowGenreDropdown(false);
    onGenreSelect(genre);
  };

  const handleTopicSearchChange = (e) => {
    const value = e.target.value;
    setTopicSearch(value);
    setSelectedTopic('');
    onTopicSelect('');
    setShowTopicDropdown(true);
  };

  const handleGenreSearchChange = (e) => {
    const value = e.target.value;
    setGenreSearch(value);
    setSelectedGenre('');
    onGenreSelect('');
    setShowGenreDropdown(true);
  };

  const isTopicValid = selectedTopic && allValidTopics.includes(selectedTopic);
  const isGenreValid = selectedGenre && allValidGenres.includes(selectedGenre);

  return (
    <div className="topic-genre-selector">
      <div className="selector-section">
        <h4>Topic Selection</h4>
        <p className="narrative-type">Narrative Type: {narrativeType}</p>
        
        {/* AI Suggestions */}
        {suggestions.topics.length > 0 && (
          <div className="suggestions-section">
            <p className="suggestions-label">AI Suggestions:</p>
            <div className="suggestion-tags">
              {suggestions.topics.map((topic, index) => {
                return (
                  <button
                    key={index}
                    type="button"
                    className={`suggestion-tag valid ${selectedTopic === topic ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTopicSelect(topic);
                    }}
                    title="Valid eBay topic"
                  >
                    {topic} ✓
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Topic Search/Selection */}
        <div className="search-section" ref={topicDropdownRef}>
          <input
            type="text"
            placeholder="Search or select a topic..."
            value={topicSearch}
            onChange={handleTopicSearchChange}
            onFocus={() => setShowTopicDropdown(true)}
            className={`topic-input ${isTopicValid ? 'valid' : selectedTopic ? 'invalid' : ''}`}
          />
          
          {showTopicDropdown && filteredTopics.length > 0 && (
            <div className="dropdown">
              {filteredTopics.map((topic, index) => (
                <div
                  key={index}
                  className="dropdown-item"
                  onClick={() => handleTopicSelect(topic)}
                >
                  {topic}
                </div>
              ))}
            </div>
          )}
          
          {selectedTopic && (
            <div className="selected-display">
              <span className={`selected-value ${isTopicValid ? 'valid' : 'invalid'}`}>
                Selected: {selectedTopic}
                {isTopicValid ? ' ✓' : ' ✗'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="selector-section">
        <h4>Genre Selection</h4>
        
        {/* AI Suggestions */}
        {suggestions.genres.length > 0 && (
          <div className="suggestions-section">
            <p className="suggestions-label">AI Suggestions:</p>
            <div className="suggestion-tags">
              {suggestions.genres.map((genre, index) => {
                return (
                  <button
                    key={index}
                    type="button"
                    className={`suggestion-tag valid ${selectedGenre === genre ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleGenreSelect(genre);
                    }}
                    title="Valid eBay genre"
                  >
                    {genre} ✓
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Genre Search/Selection */}
        <div className="search-section" ref={genreDropdownRef}>
          <input
            type="text"
            placeholder="Search or select a genre..."
            value={genreSearch}
            onChange={handleGenreSearchChange}
            onFocus={() => setShowGenreDropdown(true)}
            className={`genre-input ${isGenreValid ? 'valid' : selectedGenre ? 'invalid' : ''}`}
          />
          
          {showGenreDropdown && filteredGenres.length > 0 && (
            <div className="dropdown">
              {filteredGenres.map((genre, index) => (
                <div
                  key={index}
                  className="dropdown-item"
                  onClick={() => handleGenreSelect(genre)}
                >
                  {genre}
                </div>
              ))}
            </div>
          )}
          
          {selectedGenre && (
            <div className="selected-display">
              <span className={`selected-value ${isGenreValid ? 'valid' : 'invalid'}`}>
                Selected: {selectedGenre}
                {isGenreValid ? ' ✓' : ' ✗'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="validation-status">
        {selectedTopic && selectedGenre ? (
          <div className="status-valid">
            ✓ Topic and genre selected - ready to list!
          </div>
        ) : (
          <div className="status-info">
            💡 Click suggestions above or search manually to select topic and genre
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicGenreSelector;
