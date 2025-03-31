const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
console.log("OPENAI_API_KEY exists:", process.env.OPENAI_API_KEY ? "Yes" : "No");
console.log("OPENAI_API_KEY length:", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0);
const xml2js = require('xml2js');
const axios = require('axios');
const FormData = require('form-data');
const OpenAI = require('openai');

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Add more verbose token debugging
console.log("ENV VARS CHECK:");
console.log("Auth Token exists:", process.env.EBAY_AUTH_TOKEN ? "Yes" : "No");
console.log("Auth Token length:", process.env.EBAY_AUTH_TOKEN ? process.env.EBAY_AUTH_TOKEN.length : 0);
console.log("Auth Token first 10 chars:", process.env.EBAY_AUTH_TOKEN ? process.env.EBAY_AUTH_TOKEN.substring(0, 10) : "N/A");
console.log("Auth Token last 10 chars:", process.env.EBAY_AUTH_TOKEN ? process.env.EBAY_AUTH_TOKEN.substring(process.env.EBAY_AUTH_TOKEN.length - 10) : "N/A");

// Import our Azure Vision service
const { processImageAndExtractISBN, processImageForFlaws } = require('./azureVision');
// Import the ISBNdb client
const isbndbClient = require('./isbndbClient');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve static files from the uploads directory
app.use('/uploads', express.static('uploads'));

// Set up Multer for handling file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function(req, file, cb) {
    // Use a unique name for each file: timestamp + original extension
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueName + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});
// Validate ISBN
function isValidISBN(isbn) {
  // Remove any hyphens or spaces
  const cleanIsbn = isbn.replace(/[- ]/g, '');
  
  // ISBN-13 validation (simple check)
  if (cleanIsbn.length === 13 && (cleanIsbn.startsWith('978') || cleanIsbn.startsWith('979'))) {
    return cleanIsbn;
  }
  
  // ISBN-10 validation (simple check)
  if (cleanIsbn.length === 10 && /^[\dX]+$/.test(cleanIsbn)) {
    return cleanIsbn;
  }
  
  return null;
}

async function fetchBookMetadata(isbn) {
  console.log(`Fetching metadata for ISBN: ${isbn}`);
  
  try {
    // Get real metadata from ISBNdb
    const bookData = await isbndbClient.getBookMetadata(isbn);
    
    if (bookData && bookData.book) {
      const book = bookData.book;
      return {
        title: book.title,
        author: book.authors ? book.authors.join(', ') : 'Unknown',
        publisher: book.publisher || 'Unknown',
        publishedDate: book.date_published || 'Unknown',
        coverUrl: book.image || '', 
        synopsis: book.synopsis || '',
        pages: book.pages,
        subjects: book.subjects,
        language: book.language,
        binding: book.binding,
        edition: book.edition || null  // Extract edition from the response
      };
    } else {
      console.log('No book data returned from ISBNdb API, using fallback data');
      return {
        title: `Book Title for ISBN: ${isbn} (Data unavailable)`,
        author: 'Unknown Author',
        publisher: 'Unknown Publisher',
        publishedDate: 'Unknown',
        coverUrl: '',
        edition: null
      };
    }
  } catch (error) {
    console.error('Error fetching book metadata from ISBNdb:', error);
    return {
      title: `Book Title for ISBN: ${isbn} (API Error)`,
      author: 'Unknown Author',
      publisher: 'Unknown Publisher',
      publishedDate: 'Unknown',
      coverUrl: '',
      edition: null
    };
  }
}

/**
 * Converts a number to its ordinal string (e.g., 3 → "3rd")
 * @param {number} n 
 * @returns {string}
 */
function numberToOrdinal(n) {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Formats the edition value from metadata.
 * If the edition string already includes "Edition" (e.g., "3rd Edition" or "Third Edition"), it returns as is.
 * If it is a number (e.g., "3"), it converts it to "3rd Edition".
 * @param {string|number} edition 
 * @returns {string}
 */
function formatEdition(edition) {
  if (!edition) return '';
  const edStr = String(edition).trim();
  if (edStr.toLowerCase().includes('edition')) {
    return edStr;
  }
  if (/^\d+$/.test(edStr)) {
    return numberToOrdinal(parseInt(edStr, 10)) + ' Edition';
  }
  return edStr;
}

/**
 * Uses OpenAI to determine if a book is a regular book, cookbook, or textbook
 * based on metadata analysis rather than simple keyword matching
 * 
 * @param {Object} listingData - Book metadata including title, author, subjects, and synopsis
 * @returns {Promise<string>} - "Book", "Cookbook", or "Textbook"
 */
async function determineBookTypeUsingGPT(listingData) {
  try {
    const bookData = {
      title: listingData.title || '',
      author: listingData.author || '',
      publisher: listingData.publisher || 'Unknown',
      synopsis: listingData.synopsis || '',
      subjects: listingData.subjects || [],
      language: listingData.language || 'English'
    };

    const systemMessage = `You are an expert book classifier that determines the primary type/format of a book.
Based solely on the metadata provided, classify the book into one of exactly three categories:
1. Cookbook - For recipe books, cooking guides, and food preparation books
2. Textbook - For educational texts, academic books, study guides, and instructional material
3. Book - For all other books that are neither cookbooks nor textbooks (novels, biographies, etc.)`;

    const prompt = `
Analyze this book's metadata and determine its primary type:

BOOK METADATA:
Title: "${bookData.title}"
Author: "${bookData.author}"
Publisher: "${bookData.publisher}"
Synopsis: "${bookData.synopsis.substring(0, 1000)}${bookData.synopsis.length > 1000 ? '...' : ''}"
Subjects/Categories: ${bookData.subjects.join(', ')}

INSTRUCTIONS:
- Determine if this is a Cookbook, Textbook, or regular Book
- A Cookbook contains recipes and food preparation instructions
- A Textbook is specifically designed for educational purposes, academic study, or professional instruction
- If it's neither a cookbook nor a textbook, classify it as "Book"

ONLY RETURN one of these three words: "Book", "Cookbook", or "Textbook".
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      max_tokens: 10,
      temperature: 0.1, // Very low temperature for consistent results
    });

    const bookType = response.choices[0].message.content.trim();
    
    // Validate result is one of the expected types, default to "Book" if not
    if (bookType === "Cookbook" || bookType === "Textbook" || bookType === "Book") {
      console.log(`AI classified "${bookData.title}" as: ${bookType}`);
      return bookType;
    } else {
      console.log(`AI returned unexpected book type: "${bookType}", defaulting to "Book"`);
      return "Book";
    }
    
  } catch (error) {
    console.error('Error determining book type:', error);
    return "Book"; // Default fallback
  }
}
/**
 * Uses OpenAI to generate a highly specific, compound keyword based on deep analysis
 * of the book's metadata and synopsis, focusing on creating more targeted keywords
 * 
 * @param {Object} listingData - Book metadata including title, author, subjects, and synopsis
 * @returns {Promise<string>} - Optimized compound keyword for the book
 */
async function generateOptimizedKeywordUsingGPT(listingData, bookType) {
  console.log('========== STARTING generateOptimizedKeywordUsingGPT ==========');
  console.log(`Book title: "${listingData.title}", Author: "${listingData.author}"`);
  console.log(`Subjects: ${JSON.stringify(listingData.subjects)}`);
  console.log(`Book type: "${bookType}"`);
  
  let cookbookSpecificInstructions = '';
  if (bookType === "Cookbook") {
    cookbookSpecificInstructions = `
  SPECIAL INSTRUCTION FOR COOKBOOKS:
  This book has already been classified as a cookbook. DO NOT include the word "Cookbook" in your compound keyword.
  Instead, focus on the specific cuisine type, cooking technique, or recipe category.
  - Instead of "Italian Cookbook" → use "Italian Cuisine" or "Italian Recipes"
  - Instead of "Baking Cookbook" → use "Baking Techniques" or "Baking Recipes"
  - Instead of "Dessert Cookbook" → use "Dessert Recipes" or "Pastry Arts"
  `;
  }

  try {
    const bookData = {
      title: listingData.title || '',
      author: listingData.author || '',
      publisher: listingData.publisher || 'Unknown',
      synopsis: listingData.synopsis || '',
      subjects: listingData.subjects || [],
      language: listingData.language || 'English',
      publicationYear: listingData.publicationYear || ''
    };

    console.log('Book data prepared, proceeding with OpenAI call');

    const systemMessage = `You are an expert book metadata analyst specializing in creating the most specific, 
compound keywords for eBay book listings. Your task is to analyze book details deeply and generate 
the strongest possible compound keyword (2-3 words) that precisely targets the book's specialty.`;

    const prompt = `
Generate the most specific, accurate COMPOUND keyword for this book based on deep analysis of its metadata and synopsis:

BOOK METADATA:
Title: "${bookData.title}"
Author: "${bookData.author}"
Publisher: "${bookData.publisher}"
Publication Year: "${bookData.publicationYear}"
Synopsis: "${bookData.synopsis.substring(0, 1500)}${bookData.synopsis.length > 1500 ? '...' : ''}"
Subjects/Categories: ${bookData.subjects.join(', ')}

${cookbookSpecificInstructions}

INSTRUCTIONS:
1. Analyze ALL the provided information, focusing on finding the MOST SPECIFIC classification possible
2. Create a COMPOUND keyword (2-3 words) that combines:
   - The book's general type (biography, cookbook, textbook, novel, etc.)
   - PLUS its specific subject matter (Australian photography, quantum physics, French cuisine, etc.)
3. Look for these specific elements in the synopsis and subjects:
   - Geographical context (Australian, European, American, etc.)
   - Historical period (Medieval, Victorian, 20th Century, etc.)
   - Specific discipline (Photography, Architecture, Economics, etc.)
   - Cultural context (Indigenous, Classical, Modern, etc.)
   - Technical specialty (Portrait Photography, Microeconomics, Italian Cooking, etc.)

4. Prioritize SPECIFICITY over generality. For example:
   - Instead of just "Biography" → use "Photography Biography"
   - Instead of just "History" → use "Australian History"
   - Instead of just "Cooking" → use "Italian Cuisine" 
   - Instead of just "Science" → use "Quantum Physics"
   - Instead of just "Art" → use "Renaissance Painting"

5. For biographies, ALWAYS combine who/what the subject was with the fact it's a biography:
   - For a book about photographer Max Dupain → use "Australian Photography" not just "Biography"
   - For a book about Einstein → use "Physics Biography" not just "Biography"
   - For a book about a chef → use "Culinary Biography" not just "Biography"

EXAMPLE ANALYSES:
Example 1: "Max Dupain" by Helen Ennis
- Synopsis mentions "Australian photographer", "20th century", "iconic images"
- GOOD COMPOUND KEYWORD: "Australian Photography"
- BAD KEYWORD: just "Biography" (too general)

Example 2: "The Feynman Lectures on Physics"
- A physics textbook by Nobel laureate Richard Feynman
- GOOD COMPOUND KEYWORD: "Physics Textbook" 
- BAD KEYWORD: just "Science" or "Textbook" (too general)

The keyword should be 2-3 words and not exceed 25 characters. Return ONLY the compound keyword - no explanation, no quotation marks, no additional text.
`;

    console.log('Making OpenAI API call...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      max_tokens: 15,
      temperature: 0.2,
    });

    console.log('OpenAI API call completed successfully');
    console.log(`Raw API response: "${response.choices[0].message.content}"`);

    let keyword = response.choices[0].message.content.trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\.$/, '');
    
    console.log(`Processed keyword: "${keyword}"`);
    
    // After receiving the response, check and replace anyway if needed
    if (bookType === "Cookbook" && keyword.toLowerCase().includes('cookbook')) {
      // Replace "cookbook" with "recipes" or "cuisine" as appropriate
      keyword = keyword.replace(/cookbook/i, 'Recipes');
      console.log(`Replaced "Cookbook" with "Recipes" in keyword: "${keyword}"`);
    }

    // Validate keyword length and format
    if (keyword && keyword.length <= 25) {
      console.log(`AI generated optimized compound keyword: "${keyword}" for "${bookData.title}"`);
      return keyword;
    } else if (keyword) {
      // More intelligent truncation - keep complete words
      const words = keyword.split(' ');
      let smartTruncated = '';
      
      // Add words until we would exceed 25 chars
      for (const word of words) {
        if ((smartTruncated + ' ' + word).trim().length <= 25) {
          smartTruncated = (smartTruncated + ' ' + word).trim();
        } else {
          break;
        }
      }
      
      console.log(`AI keyword "${keyword}" was too long, smartly truncated to: "${smartTruncated}"`);
      return smartTruncated;
    } else {
      console.log('FAILED: AI returned empty keyword, falling back to basic extraction');
      return "General Interest";
    }
    
  } catch (error) {
    console.error('ERROR in generateOptimizedKeywordUsingGPT:', error);
    console.log('API error details:', error.response?.data || 'No detailed error data');
    console.log('Falling back to basic keyword');
    return "General Interest";
  } finally {
    console.log('========== FINISHED generateOptimizedKeywordUsingGPT ==========');
  }
}

/**
 * Extracts edition information from OCR text
 * 
 * @param {string} ocrText - The full text extracted from images by OCR
 * @returns {string|null} - Formatted edition text or null if not found
 */
function extractEditionFromOCR(ocrText) {
  if (!ocrText) return null;
  
  console.log("Searching for edition information in OCR text...");
  console.log("OCR Text sample:", ocrText.substring(0, 200) + "...");
  
  // First, try to find the exact match for "THIRD EDITION" or similar patterns
  const directMatches = [
    "FIRST EDITION", "SECOND EDITION", "THIRD EDITION", "FOURTH EDITION",
    "FIFTH EDITION", "SIXTH EDITION", "SEVENTH EDITION", "EIGHTH EDITION"
  ];
  
  const upperText = ocrText.toUpperCase();
  
  // Check for direct matches first (most reliable)
  for (const match of directMatches) {
    if (upperText.includes(match)) {
      const formattedEdition = match.charAt(0) + match.slice(1).toLowerCase();
      console.log(`Found direct edition match: "${match}" -> "${formattedEdition}"`);
      return formattedEdition;
    }
  }
  
  // Existing patterns (these still remain important)
  const editionPatterns = [
    { regex: /(\d+)\s+EDITION/i, format: match => `${numberToOrdinal(parseInt(match[1], 10))} Edition` },
    { regex: /EDITION\s+(\d+)/i, format: match => `${numberToOrdinal(parseInt(match[1], 10))} Edition` },
    { regex: /(\d+)(ST|ND|RD|TH)\s+EDITION/i, format: match => `${match[1]}${match[2].toLowerCase()} Edition` },
    { regex: /(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH)\s+EDITION/i, 
      format: match => match[0].replace(/EDITION/i, 'Edition')
                           .replace(/(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH)/i, 
                               m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()) },
    { regex: /(\d+)(ST|ND|RD|TH)\s+ED\./i, format: match => `${match[1]}${match[2].toLowerCase()} Ed.` },
    { regex: /(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH)\s+ED\./i, 
      format: match => match[0].replace(/ED\./i, 'Ed.')
                           .replace(/(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH)/i, 
                               m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()) }
  ];
  
  // Check each pattern
  for (const pattern of editionPatterns) {
    const match = upperText.match(pattern.regex);
    if (match) {
      const formattedEdition = pattern.format(match);
      console.log(`Found edition pattern match: "${match[0]}" -> "${formattedEdition}"`);
      return formattedEdition;
    }
  }
  
  console.log("No edition information found in OCR text");
  return null;
}

/**
 * New Direct Title Generation: Uses a completely direct approach without OpenAI
 * This ensures author names including middle initials are preserved
 * 
 * @param {Object} listingData - Book metadata
 * @returns {Promise<string>} - Complete optimized eBay title
 */
async function generateCompleteEbayTitle(listingData) {
  console.log('========== STARTING generateCompleteEbayTitle ==========');
  console.log(`Generating complete eBay title for book: "${listingData.title}"`);
  
  try {
    // Step 1: Extract and prepare title parts
    let mainTitle = listingData.title;
    let subtitle = '';
    if (listingData.title.includes(':')) {
      const parts = listingData.title.split(':');
      mainTitle = parts[0].trim();
      subtitle = parts.slice(1).join(':').trim();
    }
    
    // Prepare author name for use in title - minimal processing
    let authorName = listingData.author || '';
    console.log(`Original author name: "${authorName}"`);
    
    // Only extract first author if multiple authors
    if (authorName.includes(',') && !authorName.includes(' and ') && !authorName.includes(' & ')) {
      authorName = authorName.split(',')[0].trim();
    } else if (authorName.includes(' and ')) {
      authorName = authorName.split(' and ')[0].trim();
    } else if (authorName.includes(' & ')) {
      authorName = authorName.split(' & ')[0].trim();
    }
    
    // Remove credentials without affecting initials
    authorName = authorName.replace(/\s+(PhD|MD|Dr\.|Prof\.|MS|RDN|CD)\b/gi, '').trim();
    console.log(`Processed author name for title: "${authorName}"`);
    
    // NEW DEBUG CODE: Log the OCR text before edition extraction
    if (listingData.ocrText) {
      console.log(`OCR Text available for edition extraction, length: ${listingData.ocrText.length}`);
      console.log(`OCR Text sample: ${listingData.ocrText.substring(0, 150)}...`);
    } else {
      console.log(`No OCR Text available for edition extraction`);
    }
    
    // Look for edition information ONLY from OCR text
let editionText = '';
if (listingData.ocrText) {
  const extractedEdition = extractEditionFromOCR(listingData.ocrText);
  if (extractedEdition) {
    editionText = extractedEdition;
    console.log(`Edition extracted from OCR: "${editionText}"`);
  } else {
    console.log(`No edition found in OCR text`);
    // No fallback to metadata - we only use OCR-detected editions
  }
}

// Remove the metadata fallback completely
// We'll only use editions when explicitly found in OCR text
    
    // Combine author and edition (if editionText is not empty)
    const authorSection = editionText ? `${authorName} ${editionText}` : authorName;
    console.log(`Author section with edition (if any): "${authorSection}"`);
    
    // Rest of the function remains the same...
    const bookType = await determineBookTypeUsingGPT(listingData);
    console.log(`Book type determined: "${bookType}"`);
    
    const keyword = await generateOptimizedKeywordUsingGPT(listingData, bookType);
    console.log(`Keyword generated: "${keyword}"`);
    
    let format = 'Paperback';
    if (listingData.format || listingData.binding) {
      const formatLower = (listingData.format || listingData.binding).toLowerCase();
      if (formatLower.includes('hardcover') || formatLower.includes('hard cover') || formatLower.includes('hardback')) {
        format = 'Hardcover';
      }
    }
    
    // BUILD THE TITLE DIRECTLY - include edition through authorSection
    let title = '';
    
    // Decide if we should use subtitle
    if (mainTitle.length < 10 && subtitle) {
      title = `${mainTitle}: ${subtitle} by ${authorSection} ${format} ${bookType} ${keyword}`;
    } else {
      title = `${mainTitle} by ${authorSection} ${format} ${bookType} ${keyword}`;
    }
    
    console.log(`Directly constructed title: "${title}" (${title.length} chars)`);
    
    // Check if the title exceeds eBay's 80 character limit and shorten if necessary
    if (title.length > 80) {
      title = shortenTitle(title, mainTitle, authorSection, format, bookType, keyword);
    }
    
    console.log(`Final eBay title: "${title}" (${title.length} chars)`);
    console.log('========== FINISHED generateCompleteEbayTitle ==========');
    
    return title;
  } catch (error) {
    console.error('Error generating complete eBay title:', error);
    // Fallback to a simple format if there's an error
    return `${listingData.title} by ${listingData.author}`.substring(0, 80);
  }
}

/**
 * Shortens a title that exceeds eBay's 80 character limit
 * 
 * @param {string} fullTitle - The complete title
 * @param {string} mainTitle - Main book title
 * @param {string} author - Author name
 * @param {string} format - Format (Paperback/Hardcover)
 * @param {string} bookType - Book type (Book/Cookbook/Textbook)
 * @param {string} keyword - Specific keyword
 * @returns {string} - Shortened title within 80 characters
 */
function shortenTitle(fullTitle, mainTitle, author, format, bookType, keyword) {
  console.log('Title exceeds 80 chars, beginning shortening process...');
  
  let shortenedTitle = fullTitle;
  
  // STEP 1: Replace full format with abbreviation
  const abbreviatedFormat = format === 'Hardcover' ? 'HC' : 'PB';
  shortenedTitle = shortenedTitle
    .replace(/ Hardcover/g, ` ${abbreviatedFormat}`)
    .replace(/ Paperback/g, ` ${abbreviatedFormat}`);
  
  console.log(`After format abbreviation: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
  
  // STEP 2: If still too long, remove keyword
  if (shortenedTitle.length > 80) {
    // Save the keyword for potential re-adding later
    const savedKeyword = keyword;
    
    // Remove keyword
    shortenedTitle = shortenedTitle.replace(` ${keyword}`, '');
    console.log(`After removing keyword: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
    
    // Check if we can re-add the keyword now that we've removed it
    if (shortenedTitle.length + savedKeyword.length + 1 <= 80) {
      shortenedTitle = `${shortenedTitle} ${savedKeyword}`;
      console.log(`Re-added keyword: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
    } else {
      // Try to add just the first word of the compound keyword if possible
      const firstWord = savedKeyword.split(' ')[0];
      if (shortenedTitle.length + firstWord.length + 1 <= 80) {
        shortenedTitle = `${shortenedTitle} ${firstWord}`;
        console.log(`Added partial keyword: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
      }
    }
  }
  
  // STEP 3: If still too long, just use the title and author
  if (shortenedTitle.length > 80) {
    shortenedTitle = `${mainTitle} by ${author}`;
    console.log(`After simplifying to title and author: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
    
    // Check if we can add format abbreviation
    if (shortenedTitle.length + abbreviatedFormat.length + 1 <= 80) {
      shortenedTitle = `${shortenedTitle} ${abbreviatedFormat}`;
      console.log(`Added format abbreviation: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
    }
  }
  
  // STEP 4: Final intelligent trimming if needed
  if (shortenedTitle.length > 80) {
    console.log('Still exceeding 80 chars, applying intelligent trimming...');
    const byIndex = shortenedTitle.indexOf(' by ');
    
    if (byIndex > 0) {
      const titlePart = shortenedTitle.substring(0, byIndex).trim();
      const authorPart = shortenedTitle.substring(byIndex).trim();
      
      if (titlePart.length > 40 && authorPart.length < 35) {
        // Long title, shorter author part - trim title intelligently
        const keepChars = 80 - authorPart.length;
        
        // Find a good breaking point
        const titleWords = titlePart.split(' ');
        let truncatedTitle = '';
        let currentLength = 0;
        
        for (let i = 0; i < titleWords.length; i++) {
          if (currentLength + titleWords[i].length + 1 <= keepChars) {
            truncatedTitle += (i > 0 ? ' ' : '') + titleWords[i];
            currentLength += (i > 0 ? 1 : 0) + titleWords[i].length;
          } else {
            break;
          }
        }
        
        shortenedTitle = truncatedTitle + authorPart;
        console.log(`After intelligent title trimming: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
      } else {
        // Simple truncation to 80 chars
        shortenedTitle = shortenedTitle.substring(0, 80).trim();
        console.log(`After simple truncation: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
      }
    } else {
      // No "by" found, just truncate
      shortenedTitle = shortenedTitle.substring(0, 80).trim();
      console.log(`After simple truncation: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
    }
  }
  
  // FINAL SAFETY CHECK
  if (shortenedTitle.length > 80) {
    shortenedTitle = shortenedTitle.substring(0, 80).trim();
    console.log(`EMERGENCY FINAL CUT: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
  }
  
  return shortenedTitle;
}
/**
 * Uses OpenAI to determine if a book is Fiction or Non-Fiction
 * 
 * @param {Object} listingData - Book metadata including title, subjects, and synopsis
 * @returns {Promise<string>} - "Fiction" or "Non-Fiction"
 */
async function determineNarrativeTypeUsingGPT(listingData) {
  const prompt = `
Based on the following book metadata, determine if the book is Fiction or Non-Fiction.
Return only one word: either "Fiction" or "Non-Fiction".

Book Title: "${listingData.title}"
Synopsis: "${listingData.synopsis || ''}"
Subjects: "${listingData.subjects ? listingData.subjects.join(', ') : ''}"
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a book classification assistant." },
        { role: "user", content: prompt }
      ],
      max_tokens: 10,
      temperature: 0.2,
    });
    const narrativeType = response.choices[0].message.content.trim();
    // Ensure the result is either "Fiction" or "Non-Fiction"
    if (narrativeType === "Fiction" || narrativeType === "Non-Fiction") {
      return narrativeType;
    } else {
      // Fallback if the response is unexpected
      return "Non-Fiction";
    }
  } catch (error) {
    console.error("Error determining narrative type:", error);
    return "Non-Fiction"; // default fallback
  }
}

/**
 * Formats a language string to be properly capitalized and standardized
 * 
 * @param {string} lang - The language code or name to format
 * @returns {string} - The formatted language string
 */
function formatLanguage(lang) {
  if (!lang) return "English";
  const lower = lang.toLowerCase();
  if (lower === "en" || lower === "english") {
    return "English";
  }
  // Otherwise, return the language with first letter capitalized (or use a more complex mapping if needed)
  return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
}
/**
 * Uses OpenAI to intelligently determine appropriate eBay topics for a book
 * by evaluating each potential topic against a high confidence threshold
 * 
 * @param {Object} listingData - Book metadata including title, author, subjects, and synopsis
 * @returns {Promise<Array<string>>} - Array of high-confidence matching topics
 */
async function determineBookTopicsUsingGPT(listingData) {
  try {
    console.log('Determining appropriate eBay Topics for book:', listingData.title);
    
    // Complete list of valid eBay Topics
    const validEbayTopics = [
      "3D Art", "3D Design", "ABCs/Numbers", "Abstract Art", "Abstract Photography", 
      "Abuse", "Accounting", "Action Movies", "Activity Holiday", "Addiction", 
      "Administration", "Administrative Law", "Adoption", "African Americans", 
      "African Cuisine", "Afterlife", "Agents", "Aging", "Agriculture", "Aircraft", 
      "Air Force", "Airplanes", "Alcohol", "Alternative Belief Systems", "Alternative Health", 
      "Alternative Medicine", "Alternative Therapies", "Amateur Radio", "American Cuisine", 
      "American Football", "American History", "American Indian Wars", "American Revolution", 
      "American Revolutionary War", "Ammunition", "Amphibians", "Anatomy", "Ancient World", 
      "Ancillary Services", "Anecdotes", "Anesthesiology", "Angels", "Animal Care", 
      "Animal Husbandry", "Animal Psychology", "Animal Sports", "Animal Training", 
      "Animal Welfare", "Animation", "Anthology", "Anthropology", "Antiques", "Apple", 
      "Applied Technology", "Archaeology", "Archery", "Architectural Photography", 
      "Architecture", "Army", "Art Criticism", "Art Déco", "Art History", "Art Instruction", 
      "Artists", "Art Nouveau", "Art Theory", "Asian Cuisine", "Assertiveness", "Astrology", 
      "Astronomy", "Aura Soma", "Australasian Cuisine", "Australia", "Australian Cuisine", 
      "Australian History", "Austrian Cuisine", "Autobiography", "Automobiles", "Avant Garde", 
      "Baking", "Balcony", "Balkan Cuisine", "Ballet", "Ball Games", "Baptists", "Barbecue", 
      "Baroque", "Baseball", "Basketball", "Bathroom", "BDSM", "Beauty", "Beer", "Beliefs", 
      "Bereavement", "Beverages", "Bible", "Bicycles", "Bilingual", "Biochemistry", "Biology", 
      "Birds", "Birds of Prey", "Birdwatching", "Blues", "Board Games", "Boating", "Bodybuilding", 
      "Bonsai", "Books", "Botany", "Boxing", "Boys' Interest", "Brain Teasers", "Brazilian Cuisine", 
      "Breeding", "Bridges", "British Cuisine", "British Wars", "Broadway", "Buddhism", "Budgies", 
      "Building", "Building Plans", "Building Trade", "Business Analysis", "Business Ethics", 
      "Business Software", "Byzantine Architecture", "Cactuses", "Calligraphy", "Camping", 
      "Canadian Cuisine", "Canning", "Card Games", "Careers", "Caribbean Cuisine", "Cars", 
      "Cartooning", "Castles", "Catering Trade", "Catholicism", "Cats", "Celebrity Chef", 
      "Celtic Paganism", "Central American Cuisine", "Central European Cuisine", "Ceramics", 
      "Certification", "Charts", "Chemistry", "Chess", "Chickens", "Childbirth", "Chinese Cuisine", 
      "Christian History", "Christianity", "Christmas", "Church Buildings", "Cities", "Citizenship", 
      "Civil Engineering", "Civil War", "Classical Music", "Classic Cars", "Classicism", 
      "Classic Literature", "Classic Modern Art", "Classic Recipes", "Clean Eating", "Climbing", 
      "Clocks", "Clubs", "Coaching", "Coast Guard", "Cocktails", "Coins", "Cold Meals", 
      "Collectibles", "Colonialism", "Combat", "Combat Sports", "Comedies", "Comic Books", 
      "Coming of Age", "Commercial Art", "Commercial Forest", "Commercial Policy", 
      "Commercial Vehicle", "Commune", "Communications", "Communication Skills", 
      "Comparative Religion", "Computer Hardware", "Computer Security", "Computing", 
      "Connect the Dots", "Connoisseur", "Constitution", "Constitutional Law", "Construction", 
      "Constructivism", "Consumer Electronics", "Consumer Issues", "Contemporary", 
      "Contemporary Art", "Contemporary Folk Music", "Contemporary History", "Cooking", 
      "Cooking by Ingredient", "Cooking for Children", "Cooking for One", "Cooking with Gadgets", 
      "Coping with Illness", "Cosmology", "Costume", "Country Music", "Crafts", 
      "Crafts for Children", "Creativity", "Cricket", "Crime", "Crises", "Criticism", 
      "Crocheting", "Cross Stitch", "Crosswords", "Culinary Arts", "Culinary Techniques", 
      "Cult Movies", "Cultural History", "Cultural Studies", "Culture", "Current Affairs", 
      "Cycling", "Cycling Tours", "Dance", "Databases", "Death", "Decluttering", "Decorating", 
      "Decorative Art", "Demons", "Dental Nursing", "Dentistry", "Design", "Desktop Publishing", 
      "Desserts", "Detective Stories", "Devotions", "Diabetic Cooking", "Dice Games", "Dieting", 
      "Digital Lifestyle", "Digital Media", "Digital Photography", "Dinosaurs", "Dips", 
      "Disability Sports", "Diseases", "Disney", "Divination", "Divorce", "Doctors", 
      "Documentaries", "Dogs", "Do-It-Yourself", "Dolls", "Dramas", "Drawing", 
      "Dream Interpretation", "Drinks", "Driving", "Drugs", "Ducks", "Earth Sciences", 
      "Easter", "Eastern European Cuisine", "Easy Meals", "Ecological Construction", 
      "E-Commerce", "Economic History", "Economic Strategy", "Ecumenism", "Education", 
      "Electrical Engineering", "Electrical Installation", "Electronic Music", "Electronics", 
      "Embroidery", "Emotional Intelligence", "Employment References", "Energy Technology", 
      "English Legal System", "Enjoyment", "Entertainment", "Entrepreneurship", "Environment", 
      "Environmental Engineering", "Environmental Issues", "Environmental Protection", 
      "Episcopal Church", "Equestrian Sports", "Erotic Photography", "Esotericism", 
      "Espionage", "Ethnicity", "Ethnic Studies", "Etiquette", "EU Law", "European Championship", 
      "European Cuisine", "Exercise", "Exhibitions", "Exploration", "Extreme Sports", 
      "Family History", "Family Law", "Family Life", "Family Therapy", "Fan Fiction", 
      "Farm Animals", "Farmed Poultry", "Farm Holidays", "Fashion Design", "Fashion Photography", 
      "Fasting", "Felting", "Feng Shui", "Field Flowers", "Field Hockey", "Field Sports", 
      "Film", "Film Noir", "Fine Arts", "First Aid", "First Love", "First Names", "Fish", 
      "Fishing", "Fitness", "Floristics", "Fly Fishing", "Flying", "Food", "Food Writing", 
      "Foreign Militaries", "Forensics", "Fortresses", "Fortune-Telling", "French Cuisine", 
      "Freshwater Fish", "Freshwater Fishing", "Friendship", "Fringe Sciences", "Fruit", 
      "Fruit-Bearing Trees", "Functionalism", "Furniture", "Futurism", "Gambling", 
      "Game Programming", "Games", "Game Theory", "Garden Flowers", "Gardening", "Gardens", 
      "Geese", "Gender Studies", "Genealogy", "General Politics", "General Thriller", 
      "German Cuisine", "Germanic Paganism", "Ghosts", "Girls' Interest", "Glass", 
      "Global Politics", "Gluten-Free Cooking", "Goats", "Golf", "Gourmet", "Government", 
      "Graphical Media", "Graphic Arts", "Graphic Design", "Greek", "Greek Architecture", 
      "Greek Wars", "Greenhouses", "Grief", "Grooming", "Gulf War", "Gymnastics", "Halloween", 
      "Hamsters", "Health", "Heavy Metal", "Hedges", "Heimat", "Heimatfilme", "Helicopters", 
      "Help", "Herbary", "Herbs", "Hiking", "Hinduism", "Hip Hop", "Historic Figures", 
      "History of Ideas", "History of Technology", "Hobbies", "Holidays", "Holidays for Women", 
      "Home Decor", "Homeopathy", "Homeschooling", "Horse Riding", "Horses", "Horticulture", 
      "House Plants", "Houses", "HR", "Hundertwasser", "Hunting", "Hymns", "Ice Hockey", 
      "Ice Skating", "Ikebana", "Illustration", "Image Processing", "Indian Cuisine", 
      "Indoor Games", "Industrial Building", "Industrial Chemistry", "Industry", "Infographics", 
      "Inheritance", "Inspirational Works", "Insurance", "Interior Design", "International Cuisine", 
      "International Law", "International Politics", "International Relations", "Internet", 
      "Inventions", "Investment", "Iranian Cuisine", "Iraq War", "Irish Cuisine", "Islam", 
      "Israeli Cuisine", "IT", "Italian Cuisine", "Japanese Cuisine", "Jazz", "Jesus Christ", 
      "Jewellery", "Job Applications", "Job Hunting", "Job Interviews", "Jogging", "Judaism", 
      "Kakuro", "Kindergarten", "King Arthur", "Kitchen", "Kitchen Appliances", "Knitting", 
      "Korean Cuisine", "Korean War", "Landscape Photography", "Landscaping", "Languages", 
      "Language Skills", "Last Will and Testament", "Latin American Cuisine", "Learning to Read", 
      "Legal Thriller", "Leisure", "LGBT Studies", "Life Crisis", "Life Management", 
      "Life Partnership", "Lifestyle", "Linguistics", "Linux", "Literary Criticism", 
      "Literary Theory", "Literature", "Liturgical Year", "Local History", "Local Interest", 
      "Logic", "Love", "Low-Carb Cooking", "Lutheranism", "Mac", "Magic Tricks", 
      "Management Techniques", "Managing Conflict", "Manners", "Marathon", "Marines", 
      "Maritime History", "Marketing", "Marriage", "Martial Arts", "Massage", "Maternity", 
      "Mathematics", "Mazes", "Mechanical Engineering", "Media", "Medical Nursing", 
      "Medical Services", "Medicine", "Meditation", "Memoir", "Memorials", "Memory Improvement", 
      "Men's Fiction", "Mental Exercise", "Mental Health", "Mental Illness", "Metaphysical", 
      "Meteorology", "Methodism", "Mexican Cuisine", "Mice", "Microsoft", "Middle Ages", 
      "Middle Class", "Middle Eastern Cuisine", "Military History", "Mind", "Minority Studies", 
      "Model Railroads", "Modern Art", "Modern History", "Modern Literature", "Money", 
      "Monsters", "Mormons", "Moroccan Cuisine", "Motorcycles", "Motor Sports", "Motor Vehicles", 
      "Mountaineering", "Movies", "MS Office", "Museum Building", "Museums", "Music", 
      "Musical Instruments", "Musicals", "Music of Latin America", "Napkin Decoupage", 
      "Napoleonic Wars", "National Cooking", "National Guard", "National Law", "Native Americans", 
      "Natural Disasters", "Natural History", "Natural Materials", "Natural Medicine", "Nature", 
      "Navy", "Needlepoint", "Needlework", "Negotiating", "Neopaganism", "Network", "Networking", 
      "Neuro-Linguistic Programming", "New Age", "New Wave", "Nobility", "North African Cuisine", 
      "North American Cuisine", "North European Cuisine", "Number Puzzles", "Numismatics", 
      "Nursing", "Nutrition", "Occultism", "Ocean", "Oceanian Cuisine", "Offshore Sportfishing", 
      "Olympic Games", "Operating Systems", "Opinion of the People", "Optical Illusions", 
      "Origami", "Ornamental Fishes", "Orthodox Church", "Outdoor Activities", "Paganism", 
      "Painting Rooms", "Paintings", "Paleontology", "Paper", "Paralympic Games", 
      "Parent-Child Relationship", "Parenting", "Parrots", "Partnership", "Party Games", 
      "Patio", "Pearls", "Pediatrics", "People", "Performing Arts", "Periods of Art", 
      "Personal Development", "Personal Finance", "Pet Birds", "Philately", "Phonics", 
      "Photographers", "Photography Techniques", "Photojournalism", "Pigeons", "Pilgrimage", 
      "Pistols", "Plants", "Plays", "Poetry", "Police Units", "Political Extremism", 
      "Political History", "Political Ideologies", "Political Parties", "Political Science", 
      "Political Theory", "Popes", "Pop Music", "Pop Stars", "Popular Culture", "Popular Media", 
      "Popular Medicine", "Popular Philosophy", "Popular Psychology", "Popular Science", 
      "Portrait Photography", "Portuguese Cuisine", "Positive Thinking", "Pottery", 
      "Practical Skills", "Pregnancy", "Pre-Romanesque Architecture", "Presbyterianism", 
      "Preschool", "Presentation", "Presents", "Preserving", "Princesses", "Print Art", 
      "Product Design", "Professional Development", "Professional Finance", "Professions", 
      "Programming Languages", "Property", "Protestantism", "Proverbs", "Puberty", 
      "Public Speaking", "Pudding", "Pulps", "Puzzles", "Quackery", "Quick Meals", 
      "Quilting", "Quizzes", "Quotations", "R&B", "Racquet Sports", "Radio", "Railway", 
      "Rap", "Real Estate", "Recreation", "Recruitment Tests", "Redevelopment", "Reference", 
      "Reform Style", "Refurbishment", "Regency", "Regional Cooking", "Regional History", 
      "Relations", "Relationships", "Religions of the Ancient World", "Religious History", 
      "Renaissance", "Renewable Energy", "Renting", "Repairing", "Reptiles", "Restoration", 
      "Retirement Planning", "Revolution Architecture", "Revolvers", "Rhetoric", "Rifles", 
      "Rights", "Rituals", "Road Vehicles", "Rock Climbing", "Rock Music", "Role Playing Games", 
      "Rollerblading", "Roman Architecture", "Romanesque Art", "Roman Wars", "Royalty", 
      "Rugby", "Running", "Russian Cuisine", "Saints", "Salary", "Sales", "Satire", "Sauces", 
      "Scandinavian Cuisine", "Schlager Music", "School", "Science", "Scouting", "Scrapbooking", 
      "Screenplays", "Script/Play", "Scuba & Snorkeling", "Sculpture", "Seafood", "Security", 
      "Self-Defence", "Self-Esteem", "Self-Help", "Self-Improvement", "Self-Management", 
      "Sermons", "Setting up Business", "Sewing", "Sexual Abuse", "Sheep", "Ships", 
      "Shooting Sport", "Shrubs", "Sign Language", "Sikhism", "Silent Movies", "Silhouettes", 
      "Single Parenting", "Skateboarding", "Skating", "Small Animals", "Small Business", 
      "Snooker, Pool & Billiards", "Soccer", "Social Activists", "Social History", 
      "Social Issues", "Social Sciences", "Social Services", "Social Situations", "Society", 
      "Software Packages", "Songbirds", "Soul Music", "Soundtracks", "Soups", 
      "South American Cuisine", "South European Cuisine", "Spacecraft", "Space Exploration", 
      "Spanish Cuisine", "Speech Disorders", "Spirits", "Spooky Stories", "Sport Diving", 
      "Sports Photography", "Sports Science", "Stamps", "Stews", "Stock Exchange", "Stocks", 
      "Submarines", "Sub-Saharan African Cuisine", "Success", "Sudoku", "Sugar-Free Cooking", 
      "Supernatural", "Surgery", "Surrealism", "Survival", "Suspense", "Swimming", 
      "Swiss Cuisine", "Table Culture", "Taoism", "Tarot", "Task Force", "Tasmanian Tiger", 
      "Taxes", "Tea", "Teaching", "Technology", "Telecommunications Engineering", "Television", 
      "Tennis", "Terrorism", "Tests", "Textiles", "Theatre", "Theology", "Therapy", 
      "Thinking Techniques", "Thriller", "Time Management", "Time Travel", "Tobacciana", 
      "Topography", "Track and Field (Athletics)", "Tractors", "Trading Cards", 
      "Traditional Folk Music", "Training", "Trains", "Transport Technology", "Travel Guide", 
      "Travel with Children", "Travel Writing", "Treatments", "Trees", "Trivia", "True Crime", 
      "True Military Stories", "True Stories", "Tuning", "Turkish Cuisine", "TV Game Shows", 
      "TV Shows", "UFOlogy", "Underwater Photography", "United States Armed Forces", 
      "Vampires", "Vegan Cooking", "Vegetarian Cooking", "Vehicle Maintenance", 
      "Veterinary Medicine", "Video Games", "Video Processing", "Vietnam War", "Visualisation", 
      "Vocational Skills", "Wallpaper", "War", "Warfare", "War Photography", "Water Sports", 
      "Waterways", "Weapons", "Weather", "Web Development", "Weddings", "Weightlifting", 
      "Weight Loss", "Weight Watchers", "Welfare", "Wellness", "Wellness Holidays", 
      "Werewolves", "Western European Cuisine", "Westerns", "Wholefood", "Wicca", 
      "Wilderness", "Wild Flowers", "Wildlife", "Window Color", "Windows", "Wines", 
      "Winter Sports", "Witchcraft", "Women's Studies", "Women Sleuths", "Woodwork", 
      "Wordsearch", "Work-Life-Balance", "World Championship", "World History", 
      "World War I", "World War II", "Wrestling", "Writing", "Yoga", "Youth Work", "Zombies"
    ];
    
    // Create a structured data object for the OpenAI analysis
    const bookData = {
      title: listingData.title,
      author: listingData.author,
      publisher: listingData.publisher || 'Unknown',
      synopsis: listingData.synopsis || 'Not available',
      subjects: listingData.subjects || [],
      format: listingData.format || 'Paperback',
      language: listingData.language || 'English',
      publicationYear: listingData.publicationYear || 'Unknown'
    };
    
    // Comprehensive system message focused on accurate topic matching
    const systemMessage = `You are an expert book categorization system for eBay Australia.
You analyze book metadata and identify the most relevant eBay Topics with high confidence.
You must evaluate each topic from the provided list and only select those with very high relevance.`;
    
    const prompt = `
Analyze this book's metadata and determine which topics from the provided list match with 95%+ confidence:

BOOK METADATA:
${JSON.stringify(bookData, null, 2)}

VALID EBAY TOPICS LIST:
${validEbayTopics.join(", ")}

INSTRUCTIONS:
1. Consider the book's title, author, synopsis, and subject categories
2. Go through each topic in the VALID EBAY TOPICS LIST
3. For each topic, determine if it matches this book with 95%+ confidence
4. Include both general (e.g., "Books") and specific (e.g., "Biography", "Photography") relevant topics
5. For biographies, include appropriate topics like "Biography", related field topics, and geographical relevance
6. For the book "Max Dupain" (biography of Australian photographer), appropriate topics would include: "Books", "Biography", "Photography", "Australian History", "Artists", "Photographers"

RESPOND WITH A JSON OBJECT containing ONLY the highly relevant topics:
Format: {"topics": ["Topic1", "Topic2", "Topic3", "Topic4", "Topic5"]}
`;

    // Call OpenAI API for topics
    const topicsResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      temperature: 0.1, // Very low temperature for high precision
      response_format: { type: "json_object" },
    });
    
    // Process the OpenAI response for topics
    let topics = [];
    try {
      const responseJson = JSON.parse(topicsResponse.choices[0].message.content);
      topics = responseJson.topics || [];
      
      // Ensure we have at least "Books" as a fallback
      if (!topics.includes("Books")) {
        topics.unshift("Books");
      }
      
      console.log(`Determined eBay Topics for "${listingData.title}":`, topics);
      return topics;
    } catch (error) {
      console.error('Error parsing OpenAI response for topics:', error);
      return ["Books"]; // Fallback to basic category
    }
  } catch (error) {
    console.error('Error determining book topics:', error);
    return ["Books"]; // Fallback to basic category
  }
}
/**
 * Uses OpenAI to intelligently determine appropriate eBay genres for a book
 * by evaluating each potential genre against a high confidence threshold
 * 
 * @param {Object} listingData - Book metadata including title, author, subjects, and synopsis
 * @returns {Promise<Array<string>>} - Array of high-confidence matching genres
 */
async function determineBookGenresUsingGPT(listingData) {
  try {
    console.log('Determining appropriate eBay Genres for book:', listingData.title);
    
    // Valid eBay book genres
    const validGenres = [
      "Action", "Adaptation", "Adult & Erotic", "Adventure", "Ancient Literature",
      "Animals & Pets", "Anime", "Antiquarian & Collectible", "Art & Culture", 
      "Aviation", "Bedtime Stories & Nursery Rhymes", "Biographies & True Stories",
      "Business, Economics & Industry", "Children & Young Adults", "Comics",
      "Computer & IT", "Cookbooks", "Crime & Thriller", "Drama", "Ecology",
      "E-commerce", "Economics", "Engineering & Technology", "Environment, Nature & Earth",
      "Fairy Tale", "Family, Parenting & Relations", "Fantasy", "Farming", "Fashion",
      "Film/TV Adaptation", "Finance", "Folklore & Mythology", "Food & Drink",
      "Geography", "Health, Treatments & Medicine", "Historical", "History", "Horror",
      "Humour", "Imagery", "Law", "Leisure, Hobbies & Lifestyle", "LGBT",
      "Life Sciences", "Magic", "Management", "Marine Life", "Mathematics & Sciences",
      "Military", "Mind, Body & Spirit", "Modern & Contemporary", "Motivation",
      "Mystery", "Mysticism", "Pageants, Parades & Festivals", "Paranormal",
      "Parapsychology", "Personal & Professional Development", "Pharmacology",
      "Philosophy", "Photography", "Physics", "Physiology", "Politics & Society",
      "Psychiatry", "Psychology & Help", "Pulp Fiction", "Puzzles, Trivia & Indoor Games",
      "Religious & Spiritual", "Romance", "Science", "Science Fiction", "Sexuality",
      "Sociology", "Spirituality", "Sports", "Toys", "Transportation", "Travel",
      "Urban Fiction", "War & Combat", "Western", "Women's Fiction",
      "World literature & Classics", "Zoology"
    ];
    
    // Create a structured data object for the OpenAI analysis
    const bookData = {
      title: listingData.title,
      author: listingData.author,
      publisher: listingData.publisher || 'Unknown',
      synopsis: listingData.synopsis || 'Not available',
      subjects: listingData.subjects || [],
      format: listingData.format || 'Paperback',
      language: listingData.language || 'English',
      publicationYear: listingData.publicationYear || 'Unknown',
      narrativeType: listingData.narrativeType || 'Unknown'
    };
    
    // Comprehensive system message focused on accurate genre matching
    const systemMessage = `You are an expert book genre classification system for eBay Australia.
You analyze book metadata and identify the most relevant eBay Genres with high confidence.
You must evaluate each genre from the provided list and only select those with very high relevance.`;
    
    const prompt = `
Analyze this book's metadata and determine which genres from the provided list match with 95%+ confidence:

BOOK METADATA:
${JSON.stringify(bookData, null, 2)}

VALID EBAY GENRES LIST:
${validGenres.join(", ")}

INSTRUCTIONS:
1. Consider the book's title, author, synopsis, and subject categories
2. Go through each genre in the VALID EBAY GENRES LIST
3. For each genre, determine if it matches this book with 95%+ confidence
4. For biographies, include "Biographies & True Stories" and any subject-specific genres
5. For the book "Max Dupain" (biography of Australian photographer), appropriate genres would include: "Biographies & True Stories", "Art & Culture", "Photography" 

RESPOND WITH A JSON OBJECT containing ONLY the highly relevant genres:
Format: {"genres": ["Genre1", "Genre2", "Genre3"]}
`;

    // Call OpenAI API for genres
    const genresResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      temperature: 0.1, // Very low temperature for high precision
      response_format: { type: "json_object" },
    });
    
    // Process the OpenAI response for genres
    let genres = [];
    try {
      const responseJson = JSON.parse(genresResponse.choices[0].message.content);
      genres = responseJson.genres || [];
      
      // Ensure we have at least a basic fallback genre based on narrative type
      if (genres.length === 0) {
        if (listingData.narrativeType === "Fiction") {
          genres.push("Fiction");
        } else {
          genres.push("Non-Fiction");
        }
      }
      
      console.log(`Determined eBay Genres for "${listingData.title}":`, genres);
      return genres;
    } catch (error) {
      console.error('Error parsing OpenAI response for genres:', error);
      // Fallback based on narrative type
      return listingData.narrativeType === "Fiction" ? ["Fiction"] : ["Non-Fiction"];
    }
  } catch (error) {
    console.error('Error determining book genres:', error);
    // Fallback based on narrative type
    return listingData.narrativeType === "Fiction" ? ["Fiction"] : ["Non-Fiction"];
  }
}
/**
 * Analyzes OCR text from book images to detect quality control labels/stickers
 * and returns appropriate description text for each detected flaw
 * 
 * @param {string} ocrText - The full text extracted from the image by OCR
 * @returns {Object} - Object containing detected flaws and description snippets
 */
async function detectBookFlaws(ocrText) {
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
    }
  };
  
  // Convert OCR text to uppercase for consistent matching
  const upperText = ocrText.toUpperCase().replace(/[\r\n\t]/g, ' ');
  console.log("FLAW DETECTION - Normalized text for matching:");
  console.log(upperText);
  
  // Detect present flaws
  const detectedFlaws = [];
  
  // Check for each flaw type in the OCR text - adding more detailed logging
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
    { phrase: 'WAVY', flawType: 'WAVY PAGES' }
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
 * Determine book condition based on detected flaws
 * 
 * @param {Object} flawResults - Results from detectBookFlaws
 * @returns {string} - Either "Good" or "Acceptable"
 */
function determineBookCondition(flawResults) {
  // Default condition
  let condition = "Good";
  
  // If no flaws detected, return the default condition
  if (!flawResults || !flawResults.flawsDetected) {
    return condition;
  }
  
  // List of flaws that should downgrade condition to Acceptable
  const downgradeFlaws = [
    'ACCEPTABLE',
    'WATER DAMAGE',
    'BIND ISSUE',
    'DIRT RESIDUE',
    'FOXING',
    'NOTES'
  ];
  
  // Check if any of the detected flaws should trigger a downgrade
  for (const flaw of flawResults.flaws) {
    if (downgradeFlaws.includes(flaw.type)) {
      condition = "Acceptable";
      console.log(`Condition downgraded to Acceptable due to detected flaw: ${flaw.type}`);
      break; // Exit loop once we've downgraded
    }
  }
  
  return condition;
}
/**
 * Generate formatted description with detected flaws
 * 
 * @param {Object} flawResults - Results from detectBookFlaws
 * @returns {string} - Formatted description of flaws
 */
function generateFlawsDescription(flawResults) {
  if (!flawResults.flawsDetected) return '';
  
  let description = '';
  
  // Add each flaw on its own line exactly as specified
  flawResults.flaws.forEach((flaw, index) => {
    description += flaw.description;
    // Add line break after each flaw except the last one
    if (index < flawResults.flaws.length - 1) {
      description += '\n\n';
    }
  });
  
  return description;
}

/**
 * Generate book description HTML for eBay listing
 * 
 * @param {Object} bookData - Book metadata and flaw information
 * @returns {string} - HTML description for eBay listing
 */
function generateBookDescription(bookData) {
  // Get the title that will be used on eBay
  const ebayTitle = bookData.ebayTitle || `${bookData.title} by ${bookData.author}`;
  
  // Get flaw description if any flaws were detected
  let flawsDescriptionHtml = '';
  if (bookData.flaws && bookData.flaws.flawsDetected) {
    const flawsText = generateFlawsDescription(bookData.flaws);
    // Convert newlines to HTML breaks
    flawsDescriptionHtml = flawsText.split('\n\n').map(line => `<p>${line}</p>`).join('');
  }
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h1 style="color: #0053a0;">${ebayTitle}</h1>
      
      <p><strong>ISBN:</strong> ${bookData.isbn}</p>
      
      <h2>Product Condition:</h2>
      ${flawsDescriptionHtml}
      <p>Please be aware that this book is in pre-owned, and used condition</p>
      <p>Inscriptions on the inside cover of the book are always pictured</p>
      <p>If a book has further pen or pencil underlines, highlights, tears, or flaws a sample page will be shown with a picture reference, however it is not possible to show every page of the book where these may be apparent</p>
      <p>All pre-owned books have been cleaned to the best of our ability before listing</p>
      <p>Please refer to the attached product photos as the product listed is what you will receive</p>
      
      <h2>Postage Policy:</h2>
      <p>This item will be sent under the specified postage option stated within the allocated handling time</p>
      <p>Please double check your delivery address before payment</p>
      <p>International orders are welcomed, however any applicable customs duties are responsibility of the buyer</p>
      
      <h2>Feedback:</h2>
      <p>We make every effort to provide an accurate description of the product listed</p>
      <p><strong>If there are any issues regarding your order, please contact us as soon as possible for a complete resolution before leaving feedback</strong></p>
    </div>
  `;
}

async function uploadPhotosToEbay(imageFiles) {
  try {
    console.log('Uploading photos to eBay Picture Services (EPS)');
    
    const devId = process.env.EBAY_DEV_ID;
    const appId = process.env.EBAY_APP_ID;
    const certId = process.env.EBAY_CERT_ID;
    const authToken = process.env.EBAY_AUTH_TOKEN;
    
    const uploadedImages = [];
    
    for (const file of imageFiles) {
      const builder = new xml2js.Builder({
        rootName: 'UploadSiteHostedPicturesRequest',
        xmldec: { version: '1.0', encoding: 'UTF-8' },
        renderOpts: { pretty: true, indent: '  ', newline: '\n' },
        headless: false
      });
      
      const requestObj = {
        '$': { xmlns: 'urn:ebay:apis:eBLBaseComponents' },
        'RequesterCredentials': {
          'eBayAuthToken': authToken
        },
        'ErrorLanguage': 'en_AU',
        'WarningLevel': 'High',
        'PictureName': file.filename,
        'PictureSet': 'Standard',
        'PictureUploadPolicy': 'Add'
      };
      
      const xmlMetadata = builder.buildObject(requestObj);
      
      const imageBuffer = fs.readFileSync(file.path);
      
      const formData = new FormData();
      formData.append('XML Payload', xmlMetadata, { contentType: 'text/xml' });
      formData.append('image', imageBuffer, { filename: file.filename, contentType: file.mimetype });
      
      const apiEndpoint = process.env.NODE_ENV === 'production'
        ? 'https://api.ebay.com/ws/api.dll'
        : 'https://api.sandbox.ebay.com/ws/api.dll';
      
      console.log(`Uploading image to eBay EPS at: ${apiEndpoint}`);
      
      const response = await axios({
        method: 'post',
        url: apiEndpoint,
        headers: {
          'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
          'X-EBAY-API-APP-NAME': appId,
          'X-EBAY-API-DEV-NAME': devId,
          'X-EBAY-API-CERT-NAME': certId,
          'X-EBAY-API-SITEID': '15',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
          ...formData.getHeaders()
        },
        data: formData,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      
      console.log(`eBay Picture Upload Response for ${file.filename}:`, JSON.stringify(result, null, 2));
      
      if (result.UploadSiteHostedPicturesResponse.Ack === 'Success' ||
          result.UploadSiteHostedPicturesResponse.Ack === 'Warning') {
        const pictureUrl = result.UploadSiteHostedPicturesResponse.SiteHostedPictureDetails.FullURL;
        uploadedImages.push({
          originalFile: file.filename,
          epsUrl: pictureUrl
        });
        console.log(`Successfully uploaded image ${file.filename} to eBay with URL: ${pictureUrl}`);
      } else {
        console.error('eBay Picture Upload Error:', result.UploadSiteHostedPicturesResponse.Errors);
      }
    }
    
    console.log(`Total images uploaded to eBay: ${uploadedImages.length}`);
    return uploadedImages;
  } catch (error) {
    console.error('Error uploading photos to eBay:', error);
    throw error;
  }
}
async function createEbayDraftListing(listingData) {
  try {
    console.log('Creating eBay draft book listing with data:', listingData);
    
    const uploadedImages = await uploadPhotosToEbay(listingData.imageFiles);
    const epsImageUrls = uploadedImages.map(img => img.epsUrl);

    console.log('Number of uploaded images:', uploadedImages.length);
    console.log('Image URLs to include in listing:', epsImageUrls);
    console.log('Main image URL:', epsImageUrls.length > 0 ? epsImageUrls[0] : 'No images');
    
    const devId = process.env.EBAY_DEV_ID;
    const appId = process.env.EBAY_APP_ID;
    const certId = process.env.EBAY_CERT_ID;
    const authToken = process.env.EBAY_AUTH_TOKEN;
    
    // Get policy IDs from environment variables
    const shippingPolicyId = process.env.EBAY_SHIPPING_POLICY_ID;
    const returnPolicyId = process.env.EBAY_RETURN_POLICY_ID;
    const paymentPolicyId = process.env.EBAY_PAYMENT_POLICY_ID;
    
    console.log("Auth Token Length:", authToken ? authToken.length : 0);
    console.log("Auth Token Preview:", authToken ? authToken.substring(0, 20) + "..." : "Not found");

    // Determine book narrative type, topics, and genres using enhanced GPT functions
    const narrativeType = await determineNarrativeTypeUsingGPT(listingData);
    // Save narrative type to listingData for use in Genre determination
    listingData.narrativeType = narrativeType;

    // Get more comprehensive Topics and Genres using the enhanced functions
    const bookTopics = await determineBookTopicsUsingGPT(listingData);
    const bookGenres = await determineBookGenresUsingGPT(listingData);

    console.log(`Book categorization results:
    - Narrative Type: ${narrativeType}
    - Topics (${bookTopics.length}): ${bookTopics.join(', ')}
    - Genres (${bookGenres.length}): ${bookGenres.join(', ')}`);

    // Generate the complete eBay title using the new unified approach
    const ebayTitle = await generateCompleteEbayTitle(listingData);
    // Add it to the listingData object so the description function can access it
    listingData.ebayTitle = ebayTitle;
    
    console.log(`Generated eBay title: "${ebayTitle}"`);

    const builder = new xml2js.Builder({
      rootName: 'AddItemRequest',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '  ', newline: '\n' },
      headless: false
    });
    
    // Build the base ItemSpecifics NameValueList
    const nameValueList = [
      { 'Name': 'Format', 'Value': listingData.format || 'Paperback' },
      { 'Name': 'Author', 'Value': listingData.author },
      { 'Name': 'ISBN', 'Value': listingData.isbn },
      { 'Name': 'Book Title', 'Value': listingData.title.length > 65 
          ? listingData.title.substring(0, 62) + '...' 
          : listingData.title }
    ];
    
    // Add Narrative Type
    if (narrativeType) {
      nameValueList.push({
        'Name': 'Narrative Type',
        'Value': narrativeType
      });
    }
    
    // Add all Topics as separate entries
    bookTopics.forEach(topic => {
      nameValueList.push({
        'Name': 'Topic',
        'Value': topic
      });
    });

    // Add all Genres as separate entries
    bookGenres.forEach(genre => {
      nameValueList.push({
        'Name': 'Genre',
        'Value': genre
      });
    });
    
    // Add other item specifics
    if (listingData.publisher && listingData.publisher !== 'Unknown') {
      nameValueList.push({
        'Name': 'Publisher',
        'Value': listingData.publisher
      });
    }

    if (listingData.language) {
      nameValueList.push({
        'Name': 'Language',
        'Value': formatLanguage(listingData.language)
      });
    } else {
      nameValueList.push({
        'Name': 'Language',
        'Value': 'English'
      });
    }

    if (listingData.publicationYear) {
      nameValueList.push({
        'Name': 'Publication Year',
        'Value': listingData.publicationYear
      });
    }

    const requestObj = {
      '$': { xmlns: 'urn:ebay:apis:eBLBaseComponents' },
      'RequesterCredentials': {
        'eBayAuthToken': authToken
      },
      'ErrorLanguage': 'en_AU',
      'WarningLevel': 'High',
      'Item': {
        'Title': ebayTitle,
        'Description': generateBookDescription(listingData),
        'PrimaryCategory': {
          'CategoryID': '261186'
        },
        'StartPrice': listingData.price || '9.99',
        'CategoryMappingAllowed': 'true',
        'ConditionID': listingData.condition === 'Acceptable' ? '6000' : '5000', // 6000 = Acceptable, 5000 = Good
        'ConditionDescription': listingData.conditionDescription || 'Please refer to the attached product photos and description for detailed condition before purchasing',
        'Country': 'AU',
        'Currency': 'AUD',
        'DispatchTimeMax': '3',
        'ListingDuration': 'GTC',
        'ListingType': 'FixedPriceItem',
        'Location': process.env.SELLER_LOCATION || 'Australia',
        'PictureDetails': {
          'PictureSource': 'EPS',
          'GalleryType': 'Gallery',
          'PictureURL': epsImageUrls
        },
        'PostalCode': process.env.SELLER_POSTAL_CODE,
        'Quantity': '1',
        'ItemSpecifics': {
          'NameValueList': nameValueList
        },
        'ProductListingDetails': {
          'ISBN': listingData.isbn,
          'IncludePrefilledItemInformation': 'true',
          'UseStockPhotoURLAsGallery': 'false'
        }
      }
    };
    
    // Conditional logic based on environment and available policy IDs
    if (process.env.NODE_ENV === 'production' && (shippingPolicyId || returnPolicyId || paymentPolicyId)) {
      // Use Business Policies in production if available
      requestObj.Item.SellerProfiles = {};
      
      if (shippingPolicyId) {
        requestObj.Item.SellerProfiles.SellerShippingProfile = {
          'ShippingProfileID': shippingPolicyId
        };
      }
      
      if (returnPolicyId) {
        requestObj.Item.SellerProfiles.SellerReturnProfile = {
          'ReturnProfileID': returnPolicyId
        };
      }
      
      if (paymentPolicyId) {
        requestObj.Item.SellerProfiles.SellerPaymentProfile = {
          'PaymentProfileID': paymentPolicyId
        };
      }
      
      console.log('Using seller business policies:', JSON.stringify(requestObj.Item.SellerProfiles));
    } else {
      // Use explicit policies for sandbox or when business policies aren't available
      console.log('Using explicit shipping and return policies for sandbox testing');
      
      // Add explicit Return Policy
      requestObj.Item.ReturnPolicy = {
        'ReturnsAcceptedOption': 'ReturnsAccepted',
        'ReturnsWithinOption': 'Days_30',
        'ShippingCostPaidByOption': 'Buyer'
      };
      
      // Add explicit Shipping Details
      requestObj.Item.ShippingDetails = {
        'ShippingType': 'Flat',
        'ShippingServiceOptions': [{
          'ShippingServicePriority': '1',
          'ShippingService': 'AU_Regular',
          'ShippingServiceCost': '8.95'
        }]
      };
    }
    
    const xml = builder.buildObject(requestObj);
    
    console.log('AddItem XML Payload:', xml);
    
    const response = await axios({
      method: 'post',
      url: process.env.NODE_ENV === 'production' 
        ? 'https://api.ebay.com/ws/api.dll' 
        : 'https://api.sandbox.ebay.com/ws/api.dll',
      headers: {
        'X-EBAY-API-CALL-NAME': 'AddItem',
        'X-EBAY-API-APP-NAME': appId,
        'X-EBAY-API-DEV-NAME': devId,
        'X-EBAY-API-CERT-NAME': certId,
        'X-EBAY-API-SITEID': '15',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
        'Content-Type': 'text/xml'
      },
      data: xml
    });
    
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    console.log('eBay AddItem Response:', result);
    
    if (result.AddItemResponse.Ack === 'Success' || 
        result.AddItemResponse.Ack === 'Warning') {
      return {
        success: true,
        listingId: result.AddItemResponse.ItemID,
        ebayUrl: `https://www.ebay.com.au/itm/${result.AddItemResponse.ItemID}`,
        status: 'ACTIVE',
        isbn: listingData.isbn,
        metadata: {
          title: listingData.title,
          author: listingData.author,
          publisher: listingData.publisher,
          ebayTitle: ebayTitle,
          topics: bookTopics,
          genres: bookGenres,
          narrativeType: narrativeType
        },
        processedImage: uploadedImages.length > 0 ? uploadedImages[0].originalFile : null
      };
    } else {
      console.error('eBay API Error:', result.AddItemResponse.Errors);
      return {
        success: false,
        errors: result.AddItemResponse.Errors
      };
    }
  } catch (error) {
    console.error('Error creating eBay listing:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
app.get('/', (req, res) => {
  res.send('Hello from the Express server!');
});

app.post('/api/upload', upload.fields([
  { name: 'mainImages', maxCount: 24 },  // Allow up to 24 main images (eBay's limit)
  { name: 'flawImages', maxCount: 10 }   // Allow up to 10 flaw images
]), async (req, res) => {
  console.log('Received files:', req.files);
  
  try {
    const mainImages = req.files.mainImages || [];
    const flawImages = req.files.flawImages || [];
    
    // Ensure we have at least one main image
    if (mainImages.length === 0) {
      return res.status(400).json({ error: 'No main images uploaded' });
    }
    
    // Ensure we don't exceed eBay's limit for main images
    if (mainImages.length > 24) {
      return res.status(400).json({ 
        error: `Main images (${mainImages.length}) exceeds eBay's limit of 24 images`
      });
    }
    
// Add your eBay Marketplace Account Deletion Notification Endpoint here
app.post('/ebay-deletion', (req, res) => {
  console.log('eBay Deletion Notification Received:', req.body);
  
  const verificationToken = req.body.verificationToken;
  if (verificationToken) {
    // Respond with the token to verify your endpoint with eBay
    res.status(200).send(verificationToken);
  } else {
    // Otherwise, just acknowledge the request
    res.status(200).send('OK');
  }
});

    let isbn = null;
    let processedImage = null;
    let detectedFlaws = { flawsDetected: false, flaws: [] };
    let allOcrText = ''; // Explicitly initialize
    
    // Handle client-provided ISBN if available
    if (req.body.detectedISBN) {
      const clientIsbn = req.body.detectedISBN;
      console.log(`Client provided ISBN: ${clientIsbn}`);
      isbn = isValidISBN(clientIsbn) ? clientIsbn : null;
      if (isbn) {
        console.log(`Using client-detected ISBN: ${isbn}`);
      } else {
        console.log(`Client-provided ISBN ${clientIsbn} is invalid. Will try server-side detection.`);
      }
    }
    
    // Try to find ISBN in main images
  if (!isbn) {
    console.log('Looking for ISBN in main images...');
    
    for (const file of mainImages) {
      console.log(`Trying to extract ISBN from ${file.filename}`);
      const result = await processImageAndExtractISBN(file.path);
      
      if (result) {
        if (result.isbn) {
          isbn = result.isbn;
          processedImage = file.filename;
          console.log(`ISBN found in image ${file.filename}: ${isbn}`);
        }
      
      // Collect OCR text from each image
      if (result.ocrText) {
        allOcrText += result.ocrText + ' ';
        console.log(`Added OCR text from image ${file.filename}, current length: ${allOcrText.length}`);
      }
    }
  }
  
  // Log collected OCR text
  if (allOcrText.trim() !== '') {
    console.log('Collected OCR text for edition detection, total length:', allOcrText.length);
    console.log('OCR Text sample:', allOcrText.substring(0, 200) + '...');
  }
}
    
    // Check flaw images for condition labels
    if (flawImages.length > 0) {
      console.log('Processing flaw label images...');
      for (const file of flawImages) {
        console.log(`Checking for flaws in ${file.filename}`);
        const flawResults = await processImageForFlaws(file.path);
        
        if (flawResults.flawsDetected) {
          detectedFlaws.flawsDetected = true;
          
          // Add new flaws to the list, avoiding duplicates
          flawResults.flaws.forEach(newFlaw => {
            const existingFlawIndex = detectedFlaws.flaws.findIndex(
              existingFlaw => existingFlaw.type === newFlaw.type
            );
            
            if (existingFlawIndex === -1) {
              detectedFlaws.flaws.push(newFlaw);
            }
          });
          
          console.log(`Found flaws in image ${file.filename}:`, 
            flawResults.flaws.map(f => f.type).join(', '));
        }
      }
    }
    
    // Log flaw detection summary
    if (detectedFlaws.flawsDetected) {
      console.log('Total flaws detected:', detectedFlaws.flaws.length);
      console.log('Flaw types:', detectedFlaws.flaws.map(f => f.type).join(', '));
    } else {
      console.log('No book flaws detected in any of the uploaded images');
    }
    
    // Ensure we found an ISBN
    if (!isbn) {
      console.log('No ISBN found in any of the uploaded images');
      return res.status(400).json({ error: 'No ISBN could be detected in any of the uploaded images' });
    }
    
    // Get book metadata
    const metadata = await fetchBookMetadata(isbn);
    
    if (!metadata) {
      return res.status(404).json({ error: 'Could not retrieve book information for the detected ISBN' });
    }
    
    // Use ONLY main images for the eBay listing
    const mainImageIndex = req.body.mainImageIndex ? parseInt(req.body.mainImageIndex) : 0;

    // Determine book condition based on detected flaws
    const bookCondition = determineBookCondition(detectedFlaws);
    console.log(`Final book condition determined: ${bookCondition}`);

    // Ensure listingData explicitly includes the OCR text
  const listingData = {
    isbn: isbn,
    title: metadata.title,
    author: metadata.author,
    publisher: metadata.publisher,
    publicationYear: metadata.publishedDate ? metadata.publishedDate.substring(0, 4) : null,
    synopsis: metadata.synopsis,
    language: metadata.language || 'English',
    format: metadata.binding || 'Paperback',
    condition: bookCondition,
    conditionDescription: 'Please refer to the attached product photos and description for detailed condition before purchasing',
    price: '19.99',
    imageFiles: mainImages,
    mainImageIndex: mainImageIndex,
    subjects: metadata.subjects,
    flaws: detectedFlaws,
    ocrText: allOcrText, // Ensure OCR text is included
    edition: metadata.edition // Keep existing edition from metadata as fallback
  };

  console.log('Listing data prepared with OCR text length:', allOcrText.length);
    
    // Create the eBay listing
    const listingResponse = await createEbayDraftListing(listingData);
    
    // Send response back to client
    res.json({
      success: listingResponse.success,
      isbn,
      metadata,
      listingResponse,
      processedImage,
      mainImage: mainImages[mainImageIndex]?.filename || mainImages[0]?.filename,
      allImages: mainImages.map(f => f.filename),
      detectedFlaws: detectedFlaws.flawsDetected ? detectedFlaws.flaws.map(f => ({
        type: f.type,
        description: f.description
      })) : [],
      condition: bookCondition
    });
  } catch (error) {
    console.error('Error processing the images:', error);
    res.status(500).json({ error: 'Processing failed: ' + error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});