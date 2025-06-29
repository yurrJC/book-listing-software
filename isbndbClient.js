// isbndbClient.js
const axios = require('axios');
require('dotenv').config();

// ISBNdb API configuration
const ISBNDB_API_KEY = process.env.ISBNDB_API_KEY;
const ISBNDB_BASE_URL = 'https://api2.isbndb.com';

// Google Books API configuration (no API key required for basic usage)
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1';

/**
 * Fetches book metadata from Google Books API using an ISBN
 * @param {String} isbn - The ISBN to look up
 * @returns {Promise<Object|null>} - Returns the book metadata or null if not found
 */
async function getBookMetadataFromGoogleBooks(isbn) {
  try {
    console.log(`Looking up ISBN in Google Books: ${isbn}`);
    
    // Remove any hyphens or spaces from ISBN
    const cleanIsbn = isbn.replace(/[^0-9X]/g, '');
    
    // Endpoint for book lookup
    const url = `${GOOGLE_BOOKS_BASE_URL}/volumes?q=isbn:${cleanIsbn}`;
    
    console.log(`Calling Google Books API at: ${url}`);
    
    // Make the API request
    const response = await axios.get(url);
    
    // Check for valid response
    if (response.data && response.data.items && response.data.items.length > 0) {
      const book = response.data.items[0].volumeInfo;
      console.log(`Book found in Google Books: ${book.title}`);
      
      // Transform Google Books format to match ISBNdb format
      return {
        book: {
          title: book.title || '',
          subtitle: book.subtitle || '',
          authors: book.authors || [],
          publisher: book.publisher || '',
          date_published: book.publishedDate || '',
          image: book.imageLinks?.thumbnail || book.imageLinks?.smallThumbnail || '',
          synopsis: book.description || '',
          pages: book.pageCount || 0,
          language: book.language || '',
          subjects: book.categories || [],
          isbn13: cleanIsbn,
          isbn: cleanIsbn,
          binding: book.printType || 'Paperback',
          edition: null // Google Books doesn't provide edition info
        }
      };
    } else {
      console.log('No book data found in Google Books API response');
      return null;
    }
  } catch (error) {
    console.error('Google Books API Error:', error.response ? error.response.data : error.message);
    return null;
  }
}

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
      console.log(`Book found in ISBNdb: ${response.data.book.title}`);
      return response.data;
    } else {
      console.log('No book data found in the ISBNdb API response');
      return null;
    }
  } catch (error) {
    console.error('ISBNdb API Error:', error.response ? error.response.data : error.message);
    console.log('ISBNdb failed, trying Google Books as fallback...');
    
    // Try Google Books as fallback
    try {
      const googleBooksData = await getBookMetadataFromGoogleBooks(isbn);
      if (googleBooksData) {
        console.log('Successfully retrieved book data from Google Books fallback');
        return googleBooksData;
      }
    } catch (fallbackError) {
      console.error('Google Books fallback also failed:', fallbackError.message);
    }
    
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
  getBookMetadataFromGoogleBooks,
  getBookMetadata,
  batchGetBooks,
  searchBooks
};
