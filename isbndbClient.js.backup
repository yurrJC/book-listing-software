// isbndbClient.js
const axios = require('axios');
require('dotenv').config();

// ISBNdb API configuration
const ISBNDB_API_KEY = process.env.ISBNDB_API_KEY;
const ISBNDB_BASE_URL = 'https://api2.isbndb.com';

/**
 * Fetches book metadata from ISBNdb API using an ISBN
 * @param {String} isbn - The ISBN to look up
 * @returns {Promise<Object|null>} - Returns the book metadata or null if not found
 */
async function getBookMetadata(isbn) {
  try {
    console.log(`Looking up ISBN in ISBNdb: ${isbn}`);
    
    // Remove any hyphens or spaces from ISBN
    const cleanIsbn = isbn.replace(/[^0-9X]/g, '');
    
    // Endpoint for book lookup
    const url = `${ISBNDB_BASE_URL}/book/${cleanIsbn}`;
    
    // API call configuration
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ISBNDB_API_KEY
      }
    };
    
    console.log(`Calling ISBNdb API at: ${url}`);
    
    // Make the API request
    const response = await axios.get(url, config);
    
    // Check for valid response
    if (response.data && response.data.book) {
      console.log(`Book found: ${response.data.book.title}`);
      return response.data;
    } else {
      console.log('No book data found in the API response');
      return null;
    }
  } catch (error) {
    console.error('ISBNdb API Error:', error.response ? error.response.data : error.message);
    return null;
  }
}

/**
 * Performs batch lookup of multiple ISBNs
 * Only available in Premium & Pro subscriptions
 * @param {Array<String>} isbns - Array of ISBNs to look up
 * @returns {Promise<Object|null>} - Returns the books metadata or null if error
 */
async function batchGetBooks(isbns) {
  try {
    console.log(`Performing batch lookup for ${isbns.length} ISBNs`);
    
    // Clean ISBNs
    const cleanIsbns = isbns.map(isbn => isbn.replace(/[^0-9X]/g, ''));
    
    // Endpoint for book lookup
    const url = `${ISBNDB_BASE_URL}/books`;
    
    // API call configuration
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ISBNDB_API_KEY
      }
    };
    
    // Format data for POST request
    const data = `isbns=${cleanIsbns.join(',')}`;
    
    // Make the API request
    const response = await axios.post(url, data, config);
    
    // Check for valid response
    if (response.data && response.data.books) {
      console.log(`Found ${response.data.books.length} books`);
      return response.data;
    } else {
      console.log('No book data found in the API response');
      return null;
    }
  } catch (error) {
    console.error('ISBNdb Batch API Error:', error.response ? error.response.data : error.message);
    return null;
  }
}

/**
 * Search for books by title, author, etc.
 * @param {String} query - The search query
 * @returns {Promise<Object|null>} - Returns the search results or null if error
 */
async function searchBooks(query) {
  try {
    console.log(`Searching books with query: ${query}`);
    
    // Encode the query
    const encodedQuery = encodeURIComponent(query);
    
    // Endpoint for book search
    const url = `${ISBNDB_BASE_URL}/books/${encodedQuery}`;
    
    // API call configuration
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ISBNDB_API_KEY
      }
    };
    
    // Make the API request
    const response = await axios.get(url, config);
    
    // Check for valid response
    if (response.data && response.data.books) {
      console.log(`Found ${response.data.books.length} books in search results`);
      return response.data;
    } else {
      console.log('No search results found');
      return null;
    }
  } catch (error) {
    console.error('ISBNdb Search API Error:', error.response ? error.response.data : error.message);
    return null;
  }
}

module.exports = {
  getBookMetadata,
  batchGetBooks,
  searchBooks
};