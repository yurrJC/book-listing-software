// bookScannerIntegration.js
const azureVision = require('./azureVision');
const isbndbClient = require('./isbndbClient');

/**
 * Processes an image to extract ISBN and fetch book metadata
 * @param {String} imagePath - Path to the image file
 * @returns {Promise<Object|null>} - Returns the book metadata or null if not found
 */
async function scanAndGetBookMetadata(imagePath) {
  try {
    console.log(`Processing image for book metadata: ${imagePath}`);
    
    // Step 1: Extract ISBN from image using Azure OCR
    const isbn = await azureVision.processImageAndExtractISBN(imagePath);
    
    if (!isbn) {
      console.log('No ISBN found in the image');
      return {
        success: false,
        message: 'No ISBN barcode detected in the image',
        data: null
      };
    }
    
    console.log(`ISBN extracted: ${isbn}`);
    
    // Step 2: Fetch book metadata from ISBNdb
    const bookData = await isbndbClient.getBookMetadata(isbn);
    
    if (!bookData) {
      return {
        success: false,
        message: `ISBN ${isbn} found but no book data available`,
        isbn: isbn,
        data: null
      };
    }
    
    return {
      success: true,
      message: 'Book metadata retrieved successfully',
      isbn: isbn,
      data: bookData
    };
    
  } catch (error) {
    console.error('Error in scan and metadata process:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      data: null
    };
  }
}

/**
 * Lookup book metadata using ISBN directly (no scanning)
 * @param {String} isbn - ISBN to look up
 * @returns {Promise<Object>} - Returns the book metadata result
 */
async function getBookByIsbn(isbn) {
  try {
    console.log(`Looking up book by ISBN: ${isbn}`);
    
    // Clean the ISBN
    const cleanIsbn = isbn.replace(/[^0-9X]/g, '');
    
    // Fetch book metadata from ISBNdb
    const bookData = await isbndbClient.getBookMetadata(cleanIsbn);
    
    if (!bookData) {
      return {
        success: false,
        message: `No book data found for ISBN ${cleanIsbn}`,
        isbn: cleanIsbn,
        data: null
      };
    }
    
    return {
      success: true,
      message: 'Book metadata retrieved successfully',
      isbn: cleanIsbn,
      data: bookData
    };
    
  } catch (error) {
    console.error('Error in book lookup process:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      data: null
    };
  }
}

/**
 * Process book metadata to a standardized format
 * @param {Object} bookData - Raw book data from ISBNdb
 * @returns {Object} - Standardized book metadata
 */
function formatBookMetadata(bookData) {
  if (!bookData || !bookData.book) {
    return null;
  }
  
  const book = bookData.book;
  
  return {
    isbn: book.isbn13 || book.isbn,
    title: book.title || '',
    subtitle: book.subtitle || '',
    authors: book.authors || [],
    publisher: book.publisher || '',
    publishedDate: book.date_published || '',
    pageCount: book.pages || 0,
    language: book.language || '',
    subjects: book.subjects || [],
    synopsis: book.synopsis || '',
    dimensions: book.dimensions || {},
    imageUrl: book.image || '',
    msrp: book.msrp || '',
    binding: book.binding || '',
    rawData: book
  };
}

module.exports = {
  scanAndGetBookMetadata,
  getBookByIsbn,
  formatBookMetadata
};