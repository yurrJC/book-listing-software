// azureVision.js
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// Azure Computer Vision configuration
const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_API_KEY;

// Regex patterns for ISBN (both ISBN-10 and ISBN-13)
const ISBN_PATTERN_13 = /(?:ISBN(?:-13)?:?\s*)?(?=[0-9]{13}$|(?=(?:[0-9]+[-\s]){4})[-\s0-9]{17}$)97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9]/gi;
const ISBN_PATTERN_10 = /(?:ISBN(?:-10)?:?\s*)?(?=[0-9X]{10}$|(?=(?:[0-9]+[-\s]){3})[-\s0-9X]{13}$)[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9X]/gi;
const SIMPLE_ISBN_13 = /97[89][0-9\s-]{10,13}/g;
const SIMPLE_ISBN_10 = /[0-9]{9}[0-9X]/g;

/**
 * Processes an image file and attempts to extract an ISBN using Azure Computer Vision
 * @param {String} imagePath - Path to the image file to analyze
 * @returns {Promise<String|null>} - Returns the extracted ISBN or null if not found
 */
async function processImageAndExtractISBN(imagePath) {
  try {
    console.log(`Processing image at path: ${imagePath}`);
    
    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Call Azure's Read API instead of OCR
    // Read API is better for document text extraction
    const readResults = await performReadWithAzure(imageBuffer);
    
    // Extract ISBN from Read results
    const isbn = extractISBNFromReadResults(readResults);
    // First, we need to make sure we have the full OCR text
let allText = '';
if (readResults && readResults.analyzeResult && readResults.analyzeResult.readResults) {
  readResults.analyzeResult.readResults.forEach(page => {
    page.lines.forEach(line => {
      allText += line.text + ' ';
    });
  });
}

if (isbn) {
  console.log(`ISBN found: ${isbn}`);
  return { isbn, ocrText: allText }; // Return both ISBN and OCR text
} else {
  console.log('No ISBN found in the image');
  return { isbn: null, ocrText: allText }; // Return OCR text even if no ISBN found
}
} catch (error) {
  console.error('Error processing image for ISBN extraction:', error);
  return null;
}
}

/**
 * Performs Read operation on an image using Azure Computer Vision API
 * @param {Buffer} imageBuffer - The image buffer to analyze
 * @returns {Promise<Object>} - Returns the Read results from Azure
 */
async function performReadWithAzure(imageBuffer) {
  try {
    // Endpoint for Read operation
    const url = `${AZURE_ENDPOINT}/vision/v3.2/read/analyze`;
    console.log(`Calling Azure Read API at: ${url}`);
    
    // API call configuration
    const config = {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Ocp-Apim-Subscription-Key': AZURE_API_KEY
      }
    };
    
    // Submit the read request
    const submitResponse = await axios.post(url, imageBuffer, config);
    
    // Get the operation location for polling
    const operationLocation = submitResponse.headers['operation-location'];
    if (!operationLocation) {
      throw new Error('Operation location header not found');
    }
    
    // Poll for results - Read API is asynchronous
    let result = { status: 'notStarted' };
    const startTime = Date.now();
    const timeoutMs = 20000; // 20 seconds timeout
    console.log('Polling for Read API results...');
    
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      // Check for timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Timeout waiting for Read API results');
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        // Get current status
        const resultResponse = await axios.get(operationLocation, {
          headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
        });
        
        result = resultResponse.data;
        console.log(`Read operation status: ${result.status}`);
      } catch (error) {
        // Handle rate limiting (429) errors specifically
        if (error.response && error.response.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '3');
          console.log(`Azure API rate limited. Waiting ${retryAfter} seconds before retrying...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          // Continue the loop without updating result status
          continue;
        } else {
          throw error; // Re-throw other errors
        }
      }
    }
    
    if (result.status === 'succeeded') {
      // Save the extracted text for potential reuse by flaw detection
      if (global) global.lastExtractedText = extractFullTextFromResult(result);
      return result;
    } else {
      throw new Error(`Read operation failed: ${JSON.stringify(result.error || {})}`);
    }
  } catch (error) {
    console.error('Azure Read API Error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Extracts all text from read results for flaw detection
 * @param {Object} readResults - Results from Azure Read API
 * @returns {String} - Concatenated text from all pages
 */
function extractFullTextFromResult(readResults) {
  if (!readResults || !readResults.analyzeResult || !readResults.analyzeResult.readResults) {
    return '';
  }
  
  let allText = '';
  readResults.analyzeResult.readResults.forEach(page => {
    page.lines.forEach(line => {
      allText += line.text + ' ';
    });
  });
  
  return allText;
}

/**
 * Extracts all text from an image using Azure Read API
 * @param {String} imagePath - Path to the image file
 * @returns {Promise<String>} - Extracted text
 */
async function extractFullTextFromImage(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const readResults = await performReadWithAzure(imageBuffer);
    return extractFullTextFromResult(readResults);
  } catch (error) {
    console.error('Error extracting text from image:', error);
    return '';
  }
}

/**
 * Extracts ISBN from Read API results
 * @param {Object} readResults - The results from Azure Read API
 * @returns {String|null} - Returns the extracted ISBN or null if not found
 */
function extractISBNFromReadResults(readResults) {
  if (!readResults || !readResults.analyzeResult || !readResults.analyzeResult.readResults) {
    console.log('No read results found');
    return null;
  }
  
  // Concatenate all recognized text
  let allText = '';
  let allLines = [];
  
  // Log each line of text separately for debugging
  console.log('--- Read API Text by Line ---');
  readResults.analyzeResult.readResults.forEach((page, pageIndex) => {
    page.lines.forEach((line, lineIndex) => {
      console.log(`Page ${pageIndex+1}, Line ${lineIndex+1}: "${line.text}"`);
      allText += line.text + ' ';
      allLines.push(line.text);
    });
  });
  
  console.log('--- Full Extracted Text from Read API ---');
  console.log(allText);
  
  // DIRECT MATCH APPROACH
  
  // Look specifically for ISBN format in text lines
  for (const line of allLines) {
    // Look for exact pattern "ISBN: 978-0-947163-61-7"
    if (line.includes("ISBN:")) {
      const isbnText = line.trim();
      const cleanIsbn = isbnText.replace(/[^0-9]/g, "");
      if (cleanIsbn.length === 13 && (cleanIsbn.startsWith('978') || cleanIsbn.startsWith('979'))) {
        console.log("Found ISBN directly in text:", cleanIsbn);
        return cleanIsbn;
      }
    }
    
    // Look for pattern "9 780947 163617"
    const spacedIsbnMatch = line.match(/9\s+78[0-9\s]+/);
    if (spacedIsbnMatch) {
      const cleanIsbn = spacedIsbnMatch[0].replace(/\s+/g, "");
      if (cleanIsbn.length === 13 && (cleanIsbn.startsWith('978') || cleanIsbn.startsWith('979'))) {
        console.log("Found spaced ISBN:", cleanIsbn);
        return cleanIsbn;
      }
    }
  }
  
  // PATTERN MATCHING APPROACH
  
  // Create arrays to store all found ISBNs
  let isbn13Matches = [];
  let isbn10Matches = [];
  
  // Try to extract ISBN-13 with hyphens/spaces
  const isbnWithHyphens = allText.match(/ISBN:?\s*97[89][-\s][0-9][-\s][0-9]+[-\s][0-9]+[-\s][0-9]/gi);
  if (isbnWithHyphens && isbnWithHyphens.length > 0) {
    const cleanIsbn = isbnWithHyphens[0].replace(/[^0-9]/g, "");
    if (cleanIsbn.length === 13) {
      console.log("Found ISBN-13 with hyphens:", cleanIsbn);
      return cleanIsbn;
    }
  }
  
  // Try to extract spaced ISBN-13 (e.g., "9 780947 163617")
  const spacedIsbn = allText.match(/9\s+78[0-9\s]+/g);
  if (spacedIsbn && spacedIsbn.length > 0) {
    const cleanIsbn = spacedIsbn[0].replace(/\s+/g, "");
    if (cleanIsbn.length === 13) {
      console.log("Found spaced ISBN-13:", cleanIsbn);
      return cleanIsbn;
    }
  }
  
  // Look for ISBN patterns in the text
  let matches;
  
  // Look for explicit ISBN-13 format (e.g., "ISBN: 9781234567897")
  matches = [...allText.matchAll(ISBN_PATTERN_13)];
  for (const match of matches) {
    const rawIsbn = match[0];
    const cleanIsbn = rawIsbn.replace(/[^0-9]/g, '');
    if (cleanIsbn.length === 13 && (cleanIsbn.startsWith('978') || cleanIsbn.startsWith('979'))) {
      isbn13Matches.push(cleanIsbn);
      console.log('Found ISBN-13 pattern:', cleanIsbn);
    }
  }
  
  // If no ISBN-13 found, look for simple 13-digit number starting with 978/979
  if (isbn13Matches.length === 0) {
    matches = [...allText.matchAll(SIMPLE_ISBN_13)];
    for (const match of matches) {
      const rawIsbn = match[0];
      const cleanIsbn = rawIsbn.replace(/[^0-9]/g, '');
      if (cleanIsbn.length === 13) {
        isbn13Matches.push(cleanIsbn);
        console.log('Found simple ISBN-13:', cleanIsbn);
      }
    }
  }
  
  // Only if no ISBN-13 found, look for ISBN-10
  if (isbn13Matches.length === 0) {
    // Look for explicit ISBN-10 format
    matches = [...allText.matchAll(ISBN_PATTERN_10)];
    for (const match of matches) {
      const rawIsbn = match[0];
      const cleanIsbn = rawIsbn.replace(/[^0-9X]/g, '');
      if (cleanIsbn.length === 10) {
        isbn10Matches.push(cleanIsbn);
        console.log('Found ISBN-10 pattern:', cleanIsbn);
      }
    }
    
    // If no explicit ISBN-10, look for simple 10-digit number
    if (isbn10Matches.length === 0) {
      matches = [...allText.matchAll(SIMPLE_ISBN_10)];
      for (const match of matches) {
        const cleanIsbn = match[0];
        isbn10Matches.push(cleanIsbn);
        console.log('Found simple ISBN-10:', cleanIsbn);
      }
    }
  }
  
  // Return ISBN-13 if found, otherwise ISBN-10
  if (isbn13Matches.length > 0) {
    console.log('Using ISBN-13:', isbn13Matches[0]);
    return isbn13Matches[0];
  } else if (isbn10Matches.length > 0) {
    console.log('Using ISBN-10 (no ISBN-13 found):', isbn10Matches[0]);
    return isbn10Matches[0];
  }
  
  // GENERAL NUMBER SEARCH - last resort
  // Look for any 13-digit number starting with 978 or 979 anywhere in the text
  const allNumbers = allText.replace(/[^0-9]/g, '');
  const isbn13Regex = /97[89][0-9]{10}/g;
  const potentialIsbns = [...allNumbers.matchAll(isbn13Regex)];
  
  if (potentialIsbns.length > 0) {
    console.log('Found potential ISBN-13 from general number search:', potentialIsbns[0][0]);
    return potentialIsbns[0][0];
  }
  
  console.log('No valid ISBN pattern found in text');
  return null;
}

/**
 * Analyzes OCR text from book images to detect quality control labels/stickers
 * and returns appropriate description text for each detected flaw
 * 
 * @param {string} ocrText - The full text extracted from the image by OCR
 * @returns {Object} - Object containing detected flaws and description snippets
 */
function detectBookFlaws(ocrText) {
  console.log("FLAW DETECTION - Full OCR text:");
  console.log(ocrText);
  
  if (!ocrText) return { flawsDetected: false, flaws: [] };
  
  // Define the book flaws and their corresponding description texts
  const flawTypes = {
    'ACCEPTABLE': {
      description: 'Acceptable condition - The book has been heavily used and in acceptable condition as pictured'
    },
    'COVER CREASING': {
      description: 'Creasing to Cover - Book covers contain noticeable creasing from previous use'
    },
    'WAVY PAGES': {
      description: 'Wavy Pages - Pages throughout the book contain a wavy effect due to the manufacturers printing process'
    },
    'DIRT RESIDUE': {
      description: 'Dirt Residue - The book has noticeable dirt residue as pictured'
    },
    'INSCRIBED': {
      description: 'Inscribed - The book is inscribed with previous owners markings'
    },
    'NOTES': {
      description: 'Inscriptions within - The book has either highlighter/pen/pencil inscriptions throughout the book'
    },
    'WATER DAMAGE': {
      description: 'Water Damage - Water damage to the pages of the book with readability still intact - as pictured'
    },
    'FOXING': {
      description: 'Foxing - Foxing effect noticeable to the book - as pictured'
    },
    'YELLOWING': {
      description: 'Yellowing Age - Book contains noticeable yellowing page to pages'
    },
    'BIND ISSUE': {
      description: 'Bind issue - Noticeable wear to the books binding with no loose or missing pages - as pictured'
    },
    'WARPED': {
      description: 'Warped Book - The book shows visible warping to the cover and/or pages. This does not affect readability, but the book does not sit completely flat and may provide discomfort to some readers.'
    },
    'DIGITAL': {
      description: 'Digital Download Code - Digital access codes are not included with this purchase, in line with eBay\'s policy on electronically delivered items. Any references to digital content on the cover, in the item specifics or metadata are part of the original product packaging or eBay\'s Product ID Database and do not guarantee inclusion. This listing is for the physical book only.'
    }
  };
  
  // Convert OCR text to uppercase for consistent matching
  const upperText = ocrText.toUpperCase().replace(/[\r\n\t]/g, ' ');
  console.log("FLAW DETECTION - Normalized text for matching:");
  console.log(upperText);
  
  // Detect present flaws
  const detectedFlaws = [];
  
  // Check for each flaw type in the OCR text
  for (const [flawName, flawInfo] of Object.entries(flawTypes)) {
    console.log(`FLAW DETECTION - Checking for flaw type: ${flawName}`);
    
    // More flexible matching - look for the words separately too
    const flawWords = flawName.split(' ');
    let flawDetected = false;
    
    // Check for exact matches
    if (upperText.includes(flawName)) {
      flawDetected = true;
      console.log(`FLAW DETECTION - Exact match found for: ${flawName}`);
    } 
    // For multi-word flaws, check if all words are present in close proximity
    else if (flawWords.length > 1) {
      let allWordsPresent = true;
      for (const word of flawWords) {
        if (word.length <= 2) continue; // Skip very short words
        if (!upperText.includes(word)) {
          allWordsPresent = false;
          break;
        }
      }
      if (allWordsPresent) {
        flawDetected = true;
        console.log(`FLAW DETECTION - All words present for: ${flawName}`);
      }
    }
    
    if (flawDetected) {
      detectedFlaws.push({
        type: flawName,
        description: flawInfo.description
      });
    }
  }
  
  // Additional checks for common variations and partial matches
  const flawPhrases = [
    { phrase: 'WATER', flawType: 'WATER DAMAGE' },
    { phrase: 'DAMAGE', flawType: 'WATER DAMAGE' },
    { phrase: 'DAMAGED', flawType: 'WATER DAMAGE' },
    { phrase: 'BINDING', flawType: 'BIND ISSUE' },
    { phrase: 'SPINE', flawType: 'BIND ISSUE' },
    { phrase: 'HIGHLIGHT', flawType: 'NOTES' },
    { phrase: 'WRITING', flawType: 'NOTES' },
    { phrase: 'WRITTEN', flawType: 'NOTES' },
    { phrase: 'PEN MARK', flawType: 'NOTES' },
    { phrase: 'PENCIL', flawType: 'NOTES' },
    { phrase: 'CREASE', flawType: 'COVER CREASING' },
    { phrase: 'BENT', flawType: 'COVER CREASING' },
    { phrase: 'WORN', flawType: 'ACCEPTABLE' },
    { phrase: 'STAIN', flawType: 'DIRT RESIDUE' },
    { phrase: 'DIRTY', flawType: 'DIRT RESIDUE' },
    { phrase: 'YELLOW', flawType: 'YELLOWING' },
    { phrase: 'INSCRIPTION', flawType: 'INSCRIBED' },
    { phrase: 'SIGNED', flawType: 'INSCRIBED' },
    { phrase: 'NAME', flawType: 'INSCRIBED' },
    { phrase: 'WAVY', flawType: 'WAVY PAGES' },
    { phrase: 'WARPED', flawType: 'WARPED' },
    { phrase: 'WARP', flawType: 'WARPED' },
    { phrase: 'DIGITAL', flawType: 'DIGITAL' },
    { phrase: 'DOWNLOAD', flawType: 'DIGITAL' },
    { phrase: 'ACCESS CODE', flawType: 'DIGITAL' },
    { phrase: 'ONLINE', flawType: 'DIGITAL' }
  ];
  
  // Check for partial matches
  for (const { phrase, flawType } of flawPhrases) {
    console.log(`FLAW DETECTION - Checking for phrase: ${phrase}`);
    if (upperText.includes(phrase)) {
      console.log(`FLAW DETECTION - Phrase match found: ${phrase} -> ${flawType}`);
      
      // Check if this flaw type is already added
      if (!detectedFlaws.some(f => f.type === flawType)) {
        detectedFlaws.push({
          type: flawType,
          description: flawTypes[flawType].description
        });
        console.log(`FLAW DETECTION - Added flaw: ${flawType}`);
      }
    }
  }
  
  // Log detection results
  console.log(`FLAW DETECTION - Results: ${detectedFlaws.length} flaws detected`);
  detectedFlaws.forEach(flaw => {
    console.log(`FLAW DETECTION - Detected: ${flaw.type}`);
  });
  
  return {
    flawsDetected: detectedFlaws.length > 0,
    flaws: detectedFlaws
  };
}

/**
 * Process image to detect book flaws
 * 
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} - Detected flaws object
 */
async function processImageForFlaws(imagePath) {
  try {
    console.log(`Processing image for flaws at path: ${imagePath}`);
    
    // Extract all text from the image
    const imageBuffer = fs.readFileSync(imagePath);
    const readResults = await performReadWithAzure(imageBuffer);
    const extractedText = extractFullTextFromResult(readResults);
    
    // Now analyze for flaws using the text
    return detectBookFlaws(extractedText);
  } catch (error) {
    console.error('Error detecting flaws in image:', error);
    return { flawsDetected: false, flaws: [] };
  }
}

// Fix the module exports to include all functions
module.exports = {
  processImageAndExtractISBN,
  extractFullTextFromImage,
  processImageForFlaws,
  detectBookFlaws
};