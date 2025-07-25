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
const crypto = require('crypto');
const isProduction = true; // Force production mode
console.log('Using production eBay environment:', isProduction);

const FLAW_DEFINITIONS = {
  'COVER_CREASING': { key: 'COVER_CREASING', label: 'Cover Creasing', description: 'Cover Creasing – The cover(s) show visible creases from previous handling' },
  'WAVY_PAGES': { key: 'WAVY_PAGES', label: 'Wavy Pages', description: 'Wavy Pages – A wavy texture is present throughout the pages, likely due to the original printing or storage conditions' },
  'DIRT_RESIDUE': { key: 'DIRT_RESIDUE', label: 'Dirt Residue', description: 'Residual Marks – Some surface marks, darkened page edges, or mild discoloration may remain, especially on lighter covers, despite cleaning' },
  'INSCRIBED': { key: 'INSCRIBED', label: 'Inscribed (Owner Markings)', description: 'Inscription – The book includes a handwritten note or name from a previous owner on the inside cover' },
  'NOTES': { key: 'NOTES', label: 'Notes/Highlighting', description: 'Writing/Highlighting – The pages contain underlining, highlighting, or handwritten notes in pen, pencil or highlighter' },
  'WATER_DAMAGE': { key: 'WATER_DAMAGE', label: 'Water Damage', description: 'Water Damage – Pages show signs of water exposure, such as rippling or staining, but the text remains readable' },
  'FOXING': { key: 'FOXING', label: 'Foxing', description: 'Foxing – Brownish spotting (commonly due to age or humidity) is visible on some pages or edges' },
  'YELLOWING': { key: 'YELLOWING', label: 'Yellowing/Age Tanning', description: 'Yellowing/Tanning – Pronounced yellowing or tanning is visible on the pages and/or inside cover' },
  'BIND_ISSUE': { key: 'BIND_ISSUE', label: 'Binding Issue', description: 'Binding Wear – The spine and/or binding shows noticeable wear' },
  'CRACKED_SPINE': { key: 'CRACKED_SPINE', label: 'Cracked Spine', description: 'Cracked Spine – The spine has a deep crack from heavy use that goes beyond normal creasing. The inner binding may be visible when laid flat, but all pages remain intact and the book is still readable.' },
  'WARPED': { key: 'WARPED', label: 'Warped', description: 'Warped Book - The book shows visible warping to the cover and/or pages. This does not affect readability, but the book does not sit completely flat and may provide discomfort to some readers.' },
  'DIGITAL': { key: 'DIGITAL', label: 'Digital', description: 'Digital Download Code - Digital access codes are not included with this purchase, in line with eBay\'s policy on electronically delivered items. Any references to digital content on the cover, in the item specifics or metadata are part of the original product packaging or eBay\'s Product ID Database and do not guarantee inclusion. This listing is for the physical book only.' }
};

const EBAY_CONDITION_MAP = {
  'Brand New': '1000', 'Like New': '1500', 'Very Good': '3000', 'Good': '5000', 'Acceptable': '6000'
};

const DOWNGRADE_FLAW_KEYS = [
  'WATER_DAMAGE', 'BIND_ISSUE', 'DIRT_RESIDUE', 'FOXING', 'NOTES', 'CRACKED_SPINE'
];

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
  }); // Ensure this is the correct closing brace for the previous block

// Add more verbose token debugging
console.log("ENV VARS CHECK:");
console.log("Auth Token exists:", process.env.EBAY_AUTH_TOKEN ? "Yes" : "No");
console.log("Auth Token length:", process.env.EBAY_AUTH_TOKEN ? process.env.EBAY_AUTH_TOKEN.length : 0);
console.log("Auth Token first 10 chars:", process.env.EBAY_AUTH_TOKEN ? process.env.EBAY_AUTH_TOKEN.substring(0, 10) : "N/A");
console.log("Auth Token last 10 chars:", process.env.EBAY_AUTH_TOKEN ? process.env.EBAY_AUTH_TOKEN.substring(process.env.EBAY_AUTH_TOKEN.length - 10) : "N/A");

// Import our Azure Vision service
const { processImageAndExtractISBN } = require('./azureVision');
// Import the ISBNdb client
const isbndbClient = require('./isbndbClient');

const app = express();

// 1. First set up all middleware before routes
// Configure CORS to allow eBay domains and your frontend
app.use(cors({
  origin: ['https://book-listing-software-1.onrender.com', 'https://api.ebay.com', 'https://api.sandbox.ebay.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 2. Set up body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// GET endpoint for eBay's challenge code verification
app.get('/ebay-deletion', (req, res) => {
  console.log('eBay challenge request received');
  
  // Extract the challenge code from the query parameters
  const challengeCode = req.query.challenge_code;
  if (!challengeCode) {
    console.error('No challenge code provided');
    return res.status(400).json({ error: 'No challenge code provided' });
  }
  
  // Get verification token from environment variables
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  
  // Get endpoint URL from environment variables - make sure it matches exactly
  const endpoint = process.env.EBAY_ENDPOINT_URL;
  
  console.log(`Challenge code: "${challengeCode}"`);
  console.log(`Verification token: "${verificationToken}"`);
  console.log(`Endpoint: "${endpoint}"`);
  
  try {
    // Following EXACTLY the Node.js example from eBay
    const hash = crypto.createHash('sha256');
    hash.update(challengeCode);
    hash.update(verificationToken);
    hash.update(endpoint);
    const responseHash = hash.digest('hex');
    
    // Log response hash as eBay's example does
    console.log(`Generated challenge response: ${responseHash}`);
    
    // Set the Content-Type header explicitly to application/json
    res.setHeader('Content-Type', 'application/json');
    
    // Return the challenge response in the exact format eBay expects
    const response = {
      challengeResponse: responseHash
    };
    
    console.log(`Sending response: ${JSON.stringify(response)}`);
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error generating challenge response:', error);
    return res.status(500).json({ error: 'Failed to generate challenge response' });
  }
});

// POST endpoint for receiving the actual eBay deletion notifications
app.post('/ebay-deletion', (req, res) => {
  console.log('eBay deletion notification received:');
  console.log('Headers:', JSON.stringify(req.headers));
  console.log('Body:', JSON.stringify(req.body));
  
  // Per eBay docs, just acknowledge with 200 OK
  return res.status(200).json({ status: 'received' });
});

// Test endpoint to verify basic functionality
app.get('/test', (req, res) => {
  return res.status(200).json({ message: 'Test endpoint working' });
});

// Serve static files from the uploads directory
app.use('/uploads', express.static('uploads'));

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Book Listing API is running',
    timestamp: new Date().toISOString()
  });
});

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

    const systemMessage = `You are an expert book metadata analyst specializing in creating searchable, practical keywords for eBay book listings. Your task is to analyze book details and generate keywords that buyers actually search for.`;

    const prompt = `
Generate a practical, searchable keyword for this book based on its metadata and synopsis:

BOOK METADATA:
Title: "${bookData.title}"
Author: "${bookData.author}"
Publisher: "${bookData.publisher}"
Publication Year: "${bookData.publicationYear}"
Synopsis: "${bookData.synopsis.substring(0, 1500)}${bookData.synopsis.length > 1500 ? '...' : ''}"
Subjects/Categories: ${bookData.subjects.join(', ')}

${cookbookSpecificInstructions}

KEYWORD GENERATION PROCESS:
1. START with BROADER, SEARCHABLE CATEGORIES from metadata:
   - Prioritize: Psychology, New Age, History, Art, Fiction, Science, Cooking, Self-Help
   - Avoid overly specific terms like "Intuition", "Meditation", "Quantum Physics" unless they're the main focus
   - Choose categories people actually search for on eBay

2. ENHANCE with key terms from the synopsis when relevant:
   - Look for: Geographic terms (Australian, Aboriginal, WW2)
   - Look for: Specific fields (Jungian, Holistic, Military)
   - Look for: Cultural terms (Indigenous, Renaissance)

3. CHECK for SECONDARY SUBJECTS that could be combined:
   - If Psychology + Self-Help both apply → use "Psychology Self-Help"
   - If New Age + Psychology both apply → use "New Age Psychology"
   - If History + Military both apply → use "Military History"

4. BUILD the keyword using this priority:
   - Multiple subjects: "New Age Psychology", "Psychology Self-Help", "Military History"
   - Single enhanced: "Jungian Psychology", "WW2 History", "Australian Art"
   - Enhanced multiple: "Holistic Psychology Self-Help" (if space allows)
   - Simple subject: "Psychology", "New Age", "History", "Fiction" (as fallback)

5. PRIORITIZE SEARCHABILITY:
   - Use BROADER categories that maximize search visibility
   - Avoid overly specific terms that limit search reach
   - Choose terms people commonly search for on eBay

EXAMPLE ANALYSES:
Example 1: "How To Do The Work" by Nicole LePera
- Subjects: Psychology, Self-Help
- Synopsis mentions holistic psychology
- GOOD KEYWORD: "Psychology Self-Help" or "Holistic Psychology"
- BAD KEYWORD: "Management Leadership" (too business-specific)

Example 2: "Raki" by B. Wongar
- Subjects: Fiction, Literature
- Synopsis mentions Australian Aboriginal culture
- GOOD KEYWORD: "Australian Aboriginal Literary Fiction"
- BAD KEYWORD: "Cultural Struggles" (too academic, not searchable)

Example 3: "Low FODMAP Recipes" by Sue Shepherd
- Subjects: Cooking, Health, Diet
- Synopsis mentions IBS management
- GOOD KEYWORD: "IBS Management", "Dieting", "Health Recipes"
- BAD KEYWORD: "Digestive Health Cooking" (too specific)

The keyword should be 1-3 words and not exceed 25 characters. Return ONLY the keyword - no explanation, no quotation marks, no additional text.
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
    console.error('Error generating optimized keyword:', error);
    return "General Interest"; // Default fallback
  }
}

/**
 * NEW: Combined GPT function that generates book type, keyword, and title in a single API call
 * This significantly speeds up the listing process while maintaining the same quality
 * 
 * @param {Object} listingData - Book metadata including title, author, subjects, and synopsis
 * @returns {Promise<Object>} - Object containing bookType, keyword, and title
 */
// REMOVED: generateAllBookDataUsingGPT function - replaced with stepwise approach

/**
 * Fallback function that uses the original three separate GPT calls
 * This ensures the system continues to work even if the combined call fails
 * 
 * @param {Object} listingData - Book metadata
 * @returns {Promise<Object>} - Object containing bookType, keyword, and title
 */
async function fallbackToIndividualCalls(listingData) {
  console.log('========== STARTING FALLBACK TO INDIVIDUAL CALLS ==========');
  
  try {
    const bookType = await determineBookTypeUsingGPT(listingData);
    const keyword = await generateOptimizedKeywordUsingGPT(listingData, bookType);
    
    // For the title, we need to construct it manually since we have the parts
    let format = 'Paperback';
    if (listingData.format || listingData.binding) {
      const formatValue = (listingData.format || listingData.binding);
      const formatLower = formatValue.toLowerCase();
      console.log(`Fallback - Raw format/binding value: "${formatValue}"`);
      
      if (formatLower.includes('hardcover') || formatLower.includes('hard cover') || formatLower.includes('hardback') || formatLower === 'hardcover') {
        format = 'Hardcover';
      } else if (formatLower === 'book' || formatLower === 'paperback') {
        format = 'Paperback';
      }
    }
    
    // Build title manually
    let title = `${listingData.title} by ${listingData.author} ${format} ${bookType} ${keyword}`;
    
    // NEW: For Fiction books, ensure the title ends with "Fiction"
    const narrativeType = await determineNarrativeTypeUsingGPT(listingData);
    const isFiction = narrativeType === 'Fiction';
    
    if (isFiction && !title.toLowerCase().includes(' fiction')) {
      console.log(`Fiction book detected in fallback - ensuring title ends with "Fiction"`);
      
      // Check if we have space to add "Fiction" at the end
      const titleWithFiction = `${title} Fiction`;
      if (titleWithFiction.length <= 80) {
        title = titleWithFiction;
        console.log(`Added "Fiction" to title: "${title}"`);
      } else {
        // If adding "Fiction" would exceed 80 chars, try to preserve part of the keyword
        const titleWithoutKeyword = title.replace(` ${keyword}`, '');
        const titleWithFictionReplacement = `${titleWithoutKeyword} Fiction`;
        
        if (titleWithFictionReplacement.length <= 80) {
          // Check if we can preserve part of a compound keyword
          const keywordWords = keyword.split(' ');
          if (keywordWords.length > 1) {
            // Try to keep the first word of the compound keyword
            const firstWord = keywordWords[0];
            const titleWithFirstWord = `${titleWithoutKeyword} ${firstWord} Fiction`;
            if (titleWithFirstWord.length <= 80) {
              title = titleWithFirstWord;
              console.log(`Preserved first word of keyword: "${title}"`);
            } else {
              // If even the first word doesn't fit, just use "Fiction"
              title = titleWithFictionReplacement;
              console.log(`Replaced keyword with "Fiction": "${title}"`);
            }
          } else {
            // Single word keyword, just replace with "Fiction"
            title = titleWithFictionReplacement;
            console.log(`Replaced keyword with "Fiction": "${title}"`);
          }
        } else {
          // If still too long, just truncate and add "Fiction"
          const truncatedTitle = title.substring(0, 75).trim();
          title = `${truncatedTitle} Fiction`;
          console.log(`Truncated and added "Fiction": "${title}"`);
        }
      }
    }
    
    // Check if title exceeds 80 characters and shorten if necessary
    if (title.length > 80) {
      title = shortenTitle(title, listingData.title, listingData.author, format, bookType, keyword);
    }
    
    console.log(`Fallback results: BookType="${bookType}", Keyword="${keyword}", Title="${title}"`);
    console.log('========== FINISHED FALLBACK TO INDIVIDUAL CALLS ==========');
    
    return { bookType, keyword, title };
    
  } catch (error) {
    console.error('Error in fallback calls:', error);
    // Ultimate fallback
    return {
      bookType: 'Book',
      keyword: 'General Interest',
      title: `${listingData.title} by ${listingData.author}`.substring(0, 80)
    };
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
    // Step 1: Determine if this is a Fiction book
    const narrativeType = await determineNarrativeTypeUsingGPT(listingData);
    console.log(`Narrative type determined: "${narrativeType}"`);
    const isFiction = narrativeType === 'Fiction';
    
    // Step 2: Extract and prepare title parts
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
      const formatValue = (listingData.format || listingData.binding);
      const formatLower = formatValue.toLowerCase();
      console.log(`generateCompleteEbayTitle - Raw format/binding value: "${formatValue}"`);
      
      if (formatLower.includes('hardcover') || formatLower.includes('hard cover') || formatLower.includes('hardback') || formatLower === 'hardcover') {
        format = 'Hardcover';
      } else if (formatLower === 'book' || formatLower === 'paperback') {
        format = 'Paperback';
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
    
    // NEW: For Fiction books, ensure the title ends with "Fiction"
    if (isFiction && !title.toLowerCase().includes(' fiction')) {
      console.log(`Fiction book detected - ensuring title ends with "Fiction"`);
      
      // Check if we have space to add "Fiction" at the end
      const titleWithFiction = `${title} Fiction`;
      if (titleWithFiction.length <= 80) {
        title = titleWithFiction;
        console.log(`Added "Fiction" to title: "${title}"`);
      } else {
        // If adding "Fiction" would exceed 80 chars, try to preserve part of the keyword
        const titleWithoutKeyword = title.replace(` ${keyword}`, '');
        const titleWithFictionReplacement = `${titleWithoutKeyword} Fiction`;
        
        if (titleWithFictionReplacement.length <= 80) {
          // Check if we can preserve part of a compound keyword
          const keywordWords = keyword.split(' ');
          if (keywordWords.length > 1) {
            // Try to keep the first word of the compound keyword
            const firstWord = keywordWords[0];
            const titleWithFirstWord = `${titleWithoutKeyword} ${firstWord} Fiction`;
            if (titleWithFirstWord.length <= 80) {
              title = titleWithFirstWord;
              console.log(`Preserved first word of keyword: "${title}"`);
            } else {
              // If even the first word doesn't fit, just use "Fiction"
              title = titleWithFictionReplacement;
              console.log(`Replaced keyword with "Fiction": "${title}"`);
            }
          } else {
            // Single word keyword, just replace with "Fiction"
            title = titleWithFictionReplacement;
            console.log(`Replaced keyword with "Fiction": "${title}"`);
          }
        } else {
          // If still too long, just truncate and add "Fiction"
          const truncatedTitle = title.substring(0, 75).trim();
          title = `${truncatedTitle} Fiction`;
          console.log(`Truncated and added "Fiction": "${title}"`);
        }
      }
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
  
  // NEW: Check if this is a Fiction book and preserve "Fiction" at the end
  const isFiction = shortenedTitle.toLowerCase().includes(' fiction');
  console.log(`Fiction book detected in shortenTitle: ${isFiction}`);
  
  // STEP 1: Replace full format with abbreviation
  const abbreviatedFormat = format === 'Hardcover' ? 'HC' : 'PB';
  shortenedTitle = shortenedTitle
    .replace(/ Hardcover/g, ` ${abbreviatedFormat}`)
    .replace(/ Paperback/g, ` ${abbreviatedFormat}`);
  
  console.log(`After format abbreviation: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
  
  // STEP 2: If still too long, remove keyword (but preserve "Fiction" if present)
  if (shortenedTitle.length > 80) {
    // Save the keyword for potential re-adding later
    const savedKeyword = keyword;
    
    // Remove keyword, but be careful not to remove "Fiction" if it's part of the keyword
    if (isFiction && savedKeyword.toLowerCase().includes('fiction')) {
      // If the keyword contains "Fiction", just remove the non-fiction part
      const keywordWithoutFiction = savedKeyword.replace(/\s*fiction\s*/i, '').trim();
      if (keywordWithoutFiction) {
        shortenedTitle = shortenedTitle.replace(` ${keywordWithoutFiction}`, '');
      }
    } else {
      // Remove the entire keyword
      shortenedTitle = shortenedTitle.replace(` ${savedKeyword}`, '');
    }
    
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
    
    // NEW: For Fiction books, ensure "Fiction" is added back if we have space
    if (isFiction && !shortenedTitle.toLowerCase().includes(' fiction')) {
      const titleWithFiction = `${shortenedTitle} Fiction`;
      if (titleWithFiction.length <= 80) {
        shortenedTitle = titleWithFiction;
        console.log(`Added "Fiction" back to shortened title: "${shortenedTitle}"`);
      }
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
    // For Fiction books, ensure we preserve "Fiction" at the end
    if (isFiction) {
      const maxLength = 75; // Leave space for "Fiction"
      shortenedTitle = shortenedTitle.substring(0, maxLength).trim() + ' Fiction';
      console.log(`EMERGENCY FINAL CUT (preserving Fiction): "${shortenedTitle}" (${shortenedTitle.length} chars)`);
    } else {
      shortenedTitle = shortenedTitle.substring(0, 80).trim();
      console.log(`EMERGENCY FINAL CUT: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
    }
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
  const prompt = `\nBased on the following book metadata, determine if the book is Fiction or Non-Fiction.\nReturn only one word: either "Fiction" or "Non-Fiction".\nIf you are not certain, or if there is not enough information to confidently decide, leave the response completely blank. Do NOT guess.\n\nBook Title: "${listingData.title}"\nSynopsis: "${listingData.synopsis || ''}"\nSubjects: "${listingData.subjects ? listingData.subjects.join(', ') : ''}"\n  `;

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
    if (narrativeType === "Fiction" || narrativeType === "Non-Fiction") {
      return narrativeType;
    } else {
      return ""; // Leave blank if not confident
    }
  } catch (error) {
    console.error("Error determining narrative type:", error);
    return "";
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
 * Deletes uploaded image files from the server
 * 
 * @param {Array} imageFiles - Array of image file objects
 */
function deleteUploadedImages(imageFiles) {
  if (!imageFiles || !Array.isArray(imageFiles)) {
    console.log('No image files to delete');
    return;
  }
  
  console.log(`Deleting ${imageFiles.length} uploaded image files`);
  
  imageFiles.forEach(file => {
    try {
      // Handle both full path and filename-only scenarios
      const filePath = file.path || path.join(__dirname, 'uploads', file.filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted image file: ${filePath}`);
      } else {
        console.log(`File not found, cannot delete: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error deleting file ${file.filename || file.path}:`, error);
    }
  });
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
   * Generate book description HTML for eBay listing (MODIFIED)
   *
   * @param {Object} bookData - Book metadata
   * @param {string[]} selectedFlawKeys - Array of keys for selected flaws
   * @returns {string} - HTML description for eBay listing
   */
function generateBookDescription(bookData, selectedFlawKeys = []) { // Now accepts selectedFlawKeys
  if (!bookData) return '<p>Error: Missing book data.</p>';
  const displayTitle = bookData.ebayTitle || bookData.title || 'Book Listing';
  const isbnText = bookData.isbn || 'Not Provided';

  // Generate flaw HTML based on selectedFlawKeys
  let flawsDescriptionHtml = '';
  if (Array.isArray(selectedFlawKeys) && selectedFlawKeys.length > 0) {
    flawsDescriptionHtml = selectedFlawKeys
      .map(key => FLAW_DEFINITIONS[key]?.description) // Get description from definition
      .filter(Boolean) // Remove nulls if key invalid
      .map(line => `<p>${line}</p>`) // Wrap each flaw description in a paragraph
      .join(''); // Join paragraphs
  }
  
  // Add custom description note if provided
  let customNoteHtml = '';
  if (bookData.customDescriptionNote && bookData.customDescriptionNote.trim()) {
    customNoteHtml = `<p><strong>Additional Note:</strong> ${bookData.customDescriptionNote.trim()}</p>`;
  }
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            
<h1 style="color: #333; font-size: 24px; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">${displayTitle}</h1>

    
      
      <p><strong>ISBN:</strong> ${bookData.isbn}</p>
      
      <h2>Product Condition:</h2>
      ${customNoteHtml}
      ${flawsDescriptionHtml}
      <p>Please be aware that this book is in pre-owned condition</p>
      <p>Inscriptions on the inside cover of the book are always pictured</p>
      <p>If a book has further pen or pencil underlines, highlights, tears, or flaws a sample page will be shown with a picture reference. However it is not possible to show every page of the book where these may be apparent</p>
      <p>General pre-owned wear (e.g. dog-eared corners, page indentations, yellowing/tanning, spine creasing, shelf wear) may be present due to prior use</p>
      <p>Remainder Copies – Some books may have a small marker line or dot on the page edges, occasionally touching the cover or some page edges. This is a standard mark used to indicate discounted remainder stock.</p>
      <p>All pre-owned books have been cleaned to the best of our ability before listing</p>
      <p>All photos show the exact item for sale — you will receive the item pictured</p>
      
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
      
      const apiEndpoint = isProduction
  ? 'https://api.ebay.com/ws/api.dll'
  : 'https://api.sandbox.ebay.com/ws/api.dll';
      
      console.log(`Uploading image to eBay EPS at: ${apiEndpoint}`);
      
      const response = await axios({
        method: 'post',
        url: apiEndpoint, // Changed from isProduction to apiEndpoint
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
    const { selectedCondition = 'Good', selectedFlawKeys = [] } = listingData;
    const imagesToDelete = [...listingData.imageFiles];
    const uploadedImages = await uploadPhotosToEbay(listingData.imageFiles);
    const epsImageUrls = uploadedImages.map(img => img.epsUrl);
    // Explicitly log SKU to verify it's present
    console.log('SKU value being used:', listingData.sku);
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
    
    // Check if customTitle was provided and use it, otherwise use the pre-generated title
    let ebayTitle;
    if (listingData.customTitle) {
      ebayTitle = listingData.customTitle;
      console.log(`Using custom title: "${ebayTitle}"`);
    } else if (listingData.ebayTitle) {
      // Use the pre-generated title from the first call
      ebayTitle = listingData.ebayTitle;
      console.log(`Using pre-generated title: "${ebayTitle}"`);
    } else {
      // Fallback: generate a new title if somehow we don't have one
      ebayTitle = await generateStepwiseEbayTitle(listingData);
      console.log(`Generated new eBay title using stepwise approach: "${ebayTitle}"`);
    }
    
    // Add it to the listingData object so the description function can access it
    listingData.ebayTitle = ebayTitle;
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
    
    // Add SKU to item specifics if provided
    if (listingData.sku !== undefined && listingData.sku !== null) {
      console.log('Adding SKU to item specifics:', listingData.sku);
      nameValueList.push({
        'Name': 'SKU',
        'Value': String(listingData.sku) // Convert to string to ensure it's valid
      });
    } else {
      console.log('SKU not provided or is null/undefined, not adding to item specifics');
    }

    // Add Narrative Type
    if (narrativeType) {
      nameValueList.push({
        'Name': 'Narrative Type',
        'Value': narrativeType
      });
    }
    
    // Log the number of topics and genres
console.log(`Adding ${bookTopics.length} topics and ${bookGenres.length} genres`);

// Add topics - using original approach but with more detailed logging
bookTopics.forEach((topic, index) => {
  console.log(`Adding topic ${index + 1}/${bookTopics.length}: "${topic}"`);
  nameValueList.push({
    'Name': 'Topic',
    'Value': topic
  });
});

// Add genres - using original approach but with more detailed logging
bookGenres.forEach((genre, index) => {
  console.log(`Adding genre ${index + 1}/${bookGenres.length}: "${genre}"`);
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
        'Description': generateBookDescription(listingData, selectedFlawKeys), // Pass selectedFlawKeys
        'PrimaryCategory': {
          'CategoryID': '261186'
        },
        'StartPrice': listingData.price || '9.99',
        'CategoryMappingAllowed': 'true',
        'ConditionID': EBAY_CONDITION_MAP[selectedCondition] || 
        EBAY_CONDITION_MAP['Good'],
        'ConditionDescription': listingData.conditionDescription || 'Please refer to the attached product photos and description for detailed condition before purchasing',
        'Country': 'AU',
        'Currency': 'AUD',
        'DispatchTimeMax': '3',
        'ListingDuration': 'GTC',
        'ListingType': 'FixedPriceItem',
        'BestOfferDetails': {
  'BestOfferEnabled': 'true'
},
        'Location': process.env.SELLER_LOCATION || 'Ascot Vale, VIC',
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

    // Add SKU at the Item level if provided - ADD THIS CODE HERE
if (typeof listingData.sku === 'string' && listingData.sku.trim() !== '') {
  console.log('Setting SKU at Item level:', listingData.sku);
  requestObj.Item.SKU = listingData.sku.trim();
}
    
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
    
    const apiEndpoint = isProduction
  ? 'https://api.ebay.com/ws/api.dll'
  : 'https://api.sandbox.ebay.com/ws/api.dll';

console.log(`Creating eBay listing at: ${apiEndpoint}`);

const response = await axios({
  method: 'post',
  url: apiEndpoint,
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
          
          deleteUploadedImages(imagesToDelete);

      return {
        success: true,
        listingId: result.AddItemResponse.ItemID,
        ebayUrl: `https://www.ebay.com.au/itm/${result.AddItemResponse.ItemID}`,
        status: 'ACTIVE',
        isbn: listingData.isbn,
        sku: listingData.sku,
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
    // If there's an error specifically related to SKU, provide a clearer message
  if (error.message && error.message.includes('sku')) {
    console.error('SKU-related error detected:', error.message);
    return {
      success: false,
      error: 'There was an issue with the SKU field: ' + error.message
    };
  }
    return {
      success: false,
      error: error.message
    };
  }
}
app.get('/', (req, res) => {
  res.send('Hello from the Express server!');
});

app.post('/api/processBook', upload.fields([
  { name: 'mainImages', maxCount: 24 }
  // Removed flawImages field
]), async (req, res) => {
  console.log('Received files:', req.files);
  console.log('Received form data fields:', req.body);
  
  try {
    const mainImages = req.files.mainImages || [];
    
    // Check for manually entered ISBN
    const manualIsbn = req.body.manualIsbn ? req.body.manualIsbn.trim() : null;
    console.log('Manual ISBN provided:', manualIsbn);

    // Check for custom description note
    const customDescriptionNote = req.body.customDescriptionNote ? req.body.customDescriptionNote.trim() : null;
    console.log('Custom description note provided:', customDescriptionNote);

    // Always set the first uploaded image as the main image
    const mainImage = mainImages[0].filename;
    
    // Basic validation
    if (mainImages.length === 0) {
      return res.status(400).json({ error: 'No main images uploaded' });
    }
    
    let isbn = null;
    let processedImage = null;
    let allOcrText = '';
    
    // Try to use manual ISBN first if provided
    if (manualIsbn) {
      // Validate the manually entered ISBN
      const validatedIsbn = isValidISBN(manualIsbn);
      if (validatedIsbn) {
        isbn = validatedIsbn;
        console.log(`Using manually entered ISBN: ${isbn} - skipping all OCR processing for speed optimization`);
        // Skip OCR processing entirely when valid manual ISBN is provided
        allOcrText = ''; // Ensure OCR text is empty for manual ISBN scenarios
        console.log(`Manual ISBN optimization: Skipped OCR processing, estimated time savings: 7-17 seconds`);
      } else {
        console.warn(`Invalid manual ISBN format: ${manualIsbn}`);
      }
    }
    
    // If no valid manual ISBN, then try to extract from images
    if (!isbn) {
      console.log('Looking for ISBN in main images (first 3 only)...');
      for (let i = 0; i < Math.min(mainImages.length, 3); i++) {
        const file = mainImages[i];
        console.log(`Trying to extract ISBN from ${file.filename}`);
        const result = await processImageAndExtractISBN(file.path);
        
        if (result) {
          if (result.isbn) {
            isbn = result.isbn;
            processedImage = file.filename;
            console.log(`ISBN found in image ${file.filename}: ${isbn}`);
            break; // Stop once we find an ISBN
          }
          
          // Collect OCR text from each processed image
          if (result.ocrText) {
            allOcrText += result.ocrText + ' ';
          }
        }
      }
      
      // Only collect additional OCR text if we still don't have enough and no manual ISBN was provided
      if (allOcrText === '' && !manualIsbn && mainImages.length > 0) {
        console.log('Collecting additional OCR text for edition detection...');
        for (let i = 0; i < Math.min(mainImages.length, 3); i++) {
          const file = mainImages[i];
          try {
            const result = await processImageAndExtractISBN(file.path);
            if (result && result.ocrText) {
              allOcrText += result.ocrText + ' ';
            }
          } catch (err) {
            console.warn(`Error extracting OCR text from image ${file.filename}:`, err);
          }
        }
      }
    }
    
    // Ensure ISBN was found (either manually or via OCR)
    if (!isbn) {
      return res.status(400).json({ error: 'No ISBN could be detected in any of the uploaded images and no valid manual ISBN was provided' });
    }
    
    const initialSelectedCondition = req.body.selectedCondition || 'Good';
    let selectedFlawKeys = [];
    try {
        // Attempt to parse selectedFlaws if it exists in the body
        if (req.body.selectedFlaws) {
            selectedFlawKeys = JSON.parse(req.body.selectedFlaws);
            // Ensure it's an array after parsing
            if (!Array.isArray(selectedFlawKeys)) {
                console.warn('Parsed selectedFlaws is not an array, defaulting to empty.');
                selectedFlawKeys = [];
            }
        }
    } catch (e) {
        console.error("Failed to parse selectedFlaws JSON:", e);
        // Clean up main images if flaw parsing fails early
        if (mainImages && mainImages.length > 0) deleteUploadedImages(mainImages);
        return res.status(400).json({ success: false, error: 'Invalid selectedFlaws format. Expected a JSON array string.' });
    }
    console.log('Received initial condition:', initialSelectedCondition);
    console.log('Received flaw keys:', selectedFlawKeys);
  
    // *** NEW: Determine Final Condition based on NEW logic ***
    let finalBookCondition = initialSelectedCondition;
    // Sanitize initial condition against the map
    if (!EBAY_CONDITION_MAP[finalBookCondition]) {
        console.warn(`Received invalid initial condition "${initialSelectedCondition}", defaulting to Good.`);
        finalBookCondition = 'Good';
    }
    let conditionDowngraded = false;
    for (const flawKey of selectedFlawKeys) {
        // Check if the key exists in our definitions and is a downgrade key
        if (FLAW_DEFINITIONS[flawKey] && DOWNGRADE_FLAW_KEYS.includes(flawKey)) {
            finalBookCondition = 'Acceptable'; // Force downgrade
            conditionDowngraded = true;
            console.log(`Condition automatically downgraded to Acceptable due to flaw: ${flawKey}`);
            break; // Stop checking once downgraded
        }
    }
    console.log('Final calculated condition:', finalBookCondition);

    // Get book metadata
    const metadata = await fetchBookMetadata(isbn);
    
    if (!metadata) {
      return res.status(404).json({ error: 'Could not retrieve book information for the ISBN' });
    }
    
    // Use stepwise AI-powered title generation
    console.log('Using stepwise AI-powered title generation...');
    const ebayTitle = await generateStepwiseEbayTitle({
      ...metadata,
      ocrText: manualIsbn ? '' : allOcrText,
      format: metadata.binding || 'Paperback'
    });
    
    // Return the data to the client
    res.json({
      success: true,
      isbn,
      metadata,
      ebayTitle, // Important - include the generated eBay title
      processedImage,
      mainImage: mainImage,
      allImages: mainImages.map(f => f.filename),
      selectedFlawKeys: selectedFlawKeys, // The keys received/parsed
      condition: finalBookCondition,      // The final calculated condition
      conditionDowngraded: conditionDowngraded, // Add this flag
      customDescriptionNote: customDescriptionNote, // Pass through custom description note
      uploadId: Date.now(), // Optional - can be used to reference this upload
      manualIsbnUsed: !!manualIsbn && isbn === isValidISBN(manualIsbn) // Flag to indicate manual ISBN was used
    });
    
  } catch (error) {
    console.error('Error processing the images:', error);
    const uploadedFilesOnError = req.files?.mainImages || []; // Get files actually uploaded
    if (uploadedFilesOnError.length > 0) {
        console.log(`Attempting cleanup of ${uploadedFilesOnError.length} file(s) after error...`);
        deleteUploadedImages(uploadedFilesOnError); // Use the correct variable
    } else {
        console.log('No req.files.mainImages found to clean up after error.');
    }
  }
});

// In your server.js or routes file
app.post('/api/createListing', upload.fields([{ name: 'imageFiles', maxCount: 24 }]), async (req, res) => {
  console.log('\n--- Received /api/createListing Request (Multipart) ---');
  console.log('Body Keys:', Object.keys(req.body));
  console.log('Files received:', req.files?.imageFiles?.length || 0);

  try {
    // *** Get files from req.files ***
    const imageFileObjects = req.files?.imageFiles || [];
    // *** Get other data from req.body ***
    const {
        isbn, price, sku, customTitle, selectedCondition, ocrText,
        title, author, publisher, publicationYear, synopsis, language,
        format, // Assuming format is sent back if needed for display/logic
        subjects, // Expecting this as a JSON string potentially
        ebayTitle, // Expecting the pre-generated title
        customDescriptionNote // Custom description note from frontend
    } = req.body;

    // *** Parse selectedFlawKeys from body ***
    let selectedFlawKeys = [];
    try {
        if (req.body.selectedFlawKeys) {
             selectedFlawKeys = JSON.parse(req.body.selectedFlawKeys);
             if (!Array.isArray(selectedFlawKeys)) selectedFlawKeys = [];
        }
    } catch (e) {
        console.error("Failed to parse selectedFlawKeys:", e);
        return res.status(400).json({ success: false, error: 'Invalid flaw data format.' });
     }

    // --- Validation ---
    if (!isbn || !isValidISBN(isbn)) return res.status(400).json({ success: false, error: 'Valid ISBN is required' });
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) return res.status(400).json({ success: false, error: 'Valid price is required' });
    if (imageFileObjects.length === 0) return res.status(400).json({ success: false, error: 'At least one image file is required' });
    if (!selectedCondition || !EBAY_CONDITION_MAP[selectedCondition]) return res.status(400).json({ success: false, error: 'A valid condition selection is required' });
    console.log("Validation passed for /api/createListing.");
    // --- End Validation ---

    // --- Prepare listingData (using data from THIS request) ---
    let parsedSubjects = [];
    try {
        // Attempt to parse subjects only if it exists and is a string
        if (subjects && typeof subjects === 'string') {
            parsedSubjects = JSON.parse(subjects);
            if (!Array.isArray(parsedSubjects)) parsedSubjects = []; // Ensure array
        } else if (Array.isArray(subjects)) {
            parsedSubjects = subjects; // Already an array
        }
    } catch(e) { console.warn("Could not parse subjects string:", subjects, e); parsedSubjects = [];}

    const listingData = {
      // Core data from body
      isbn, price, sku: sku || '', customTitle, selectedCondition,
      selectedFlawKeys, ocrText: ocrText || '',
      // Image file objects from THIS request's upload
      imageFiles: imageFileObjects,
      // Metadata fields passed back from frontend (add fallbacks)
      title: title || '', author: author || '', publisher: publisher || '', publicationYear,
      synopsis: synopsis || '', language: language || '', format: format || 'Paperback', // Add default format
      subjects: parsedSubjects, // Use parsed subjects
      ebayTitle, // Generated title passed back from frontend
      customDescriptionNote: customDescriptionNote || '' // Custom description note
    };

    // --- Create eBay Listing ---
    console.log('Calling createEbayDraftListing with prepared data...');
    const listingResponse = await createEbayDraftListing(listingData);
    console.log('Received response from createEbayDraftListing:', listingResponse);

    // --- Check success / Send Response ---
    if (!listingResponse || !listingResponse.success) {
         console.error('createEbayDraftListing indicated failure:', listingResponse);
         let statusCode = 500;
         let errorMessage = listingResponse?.error || 'Failed to create listing on eBay.';
         if (listingResponse?.errors) {
             const ebayError = Array.isArray(listingResponse.errors) ? listingResponse.errors[0] : listingResponse.errors;
             if (ebayError?.SeverityCode === 'Error') statusCode = 400;
             errorMessage = ebayError?.LongMessage || ebayError?.ShortMessage || errorMessage;
         }
         // IMPORTANT: Do NOT delete image files here if listing failed
         return res.status(statusCode).json({
             success: false,
             error: errorMessage,
             details: listingResponse?.errors
         });
    } else {
      // SUCCESS: listingResponse contains success:true
      console.log('Sending success response from /api/createListing');
      // Image deletion happens inside createEbayDraftListing upon its success
      res.json({
          success: true,
          ...listingResponse // Spread the success data (listingId, url, metadata, etc.)
      });
    }

  } catch (error) { // Catch errors within this handler
    console.error('!!! Unexpected error in /api/createListing endpoint handler !!!');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('Error Object:', error); // Log the raw error object

    // Attempt cleanup of files uploaded in *this specific request*
    if (req.files?.imageFiles && Array.isArray(req.files.imageFiles)) {
        console.log(`Attempting cleanup of ${req.files.imageFiles.length} file(s) after handler error...`);
        deleteUploadedImages(req.files.imageFiles);
    } else {
        console.log('No req.files found to clean up after handler error.');
    }

  res.status(500).json({
    success: false, // Indicate failure
    error: `Processing failed unexpectedly: ${error.message || 'Unknown server error'}`
  });
} // Close the catch block
}); // Close the app.post('/api/createListing') route handler

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Replace the simple enforceEbayTitleLimit function with smart keyword truncation
function smartKeywordTruncation(baseTitle, fullKeyword) {
  const baseLength = baseTitle.length;
  const availableSpace = 80 - baseLength;
  
  if (availableSpace <= 0) {
    return baseTitle; // No space for keyword
  }
  
  const keywordWords = fullKeyword.split(' ');
  let bestFit = '';
  
  // Try to fit as many complete words as possible
  for (let i = 1; i <= keywordWords.length; i++) {
    const testKeyword = keywordWords.slice(0, i).join(' ');
    if (testKeyword.length <= availableSpace) {
      bestFit = testKeyword;
    } else {
      break; // Stop when we can't fit more words
    }
  }
  
  return bestFit ? `${baseTitle} ${bestFit}` : baseTitle;
}

function enforceEbayTitleLimit(title) {
  let cleanTitle = (title || '').replace(/\s+/g, ' ').trim();
  
  // If already under 80 chars, return as is
  if (Buffer.byteLength(cleanTitle, 'utf8') <= 80) {
    return cleanTitle;
  }
  
  // Extract the base title (everything before the keyword)
  const parts = cleanTitle.split(' ');
  const byIndex = parts.findIndex(word => word.toLowerCase() === 'by');
  
  if (byIndex !== -1 && byIndex + 2 < parts.length) {
    // Find where the keyword starts (after "by Author Format BookType")
    const keywordStartIndex = byIndex + 3; // by + author + format + booktype
    const baseTitle = parts.slice(0, keywordStartIndex).join(' ');
    const keyword = parts.slice(keywordStartIndex).join(' ');
    
    // Use smart truncation for the keyword
    const smartTruncated = smartKeywordTruncation(baseTitle, keyword);
    
    // FINAL CHECK: If smart truncation still doesn't work, hard truncate
    if (Buffer.byteLength(smartTruncated, 'utf8') <= 80) {
      return smartTruncated;
    } else {
      console.log(`Smart truncation failed, hard truncating from ${smartTruncated.length} to 80 chars`);
      // Hard truncate to 80 characters, ensuring we don't cut words in half
      let hardTruncated = smartTruncated;
      while (Buffer.byteLength(hardTruncated, 'utf8') > 80) {
        hardTruncated = hardTruncated.slice(0, -1).trim();
      }
      return hardTruncated;
    }
  } else {
    // Fallback: simple truncation if we can't parse the structure
    console.log(`Cannot parse title structure, hard truncating from ${cleanTitle.length} to 80 chars`);
    while (Buffer.byteLength(cleanTitle, 'utf8') > 80) {
      cleanTitle = cleanTitle.slice(0, -1).trim();
    }
    return cleanTitle;
  }
}

// Fix the AI truncation to only use code logic as true fallback
async function aiIntelligentTruncation(title) {
  const prompt = `\nThe following eBay title is ${title.length} characters long, which exceeds eBay's 80-character limit.\n\nTitle: "${title}"\n\nPlease truncate this title intelligently to fit within 80 characters while following these rules:\n- Keep the most important keywords (first words)\n- Avoid awkward endings (no partial words)\n- Preserve the core meaning\n- Always end with complete words\n- If the title is "Title by Author Format BookType Keyword", prioritize keeping the first part of the keyword\n- The result MUST be 80 characters or less\n\nReturn ONLY the truncated title, with no explanation or extra text.`;
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert at creating concise, effective eBay titles that fit within character limits while preserving the most important information." },
        { role: "user", content: prompt }
      ],
      max_tokens: 50,
      temperature: 0.1,
    });
    
    const truncatedTitle = response.choices[0].message.content.trim();
    
    // Trust the AI's output - only validate it's not empty
    if (truncatedTitle && truncatedTitle.length > 0) {
      // FINAL VALIDATION: Ensure the AI's output is actually under 80 characters
      if (Buffer.byteLength(truncatedTitle, 'utf8') <= 80) {
        console.log(`AI truncation successful: "${truncatedTitle}" (${truncatedTitle.length} chars)`);
        return truncatedTitle;
      } else {
        console.log(`AI truncation returned title still too long (${truncatedTitle.length} chars), using fallback logic`);
        return enforceEbayTitleLimit(title);
      }
    } else {
      // Only fallback if AI returns empty/null
      console.log('AI truncation returned empty result, using fallback logic');
      return enforceEbayTitleLimit(title);
    }
  } catch (error) {
    console.error('Error in AI truncation:', error);
    // Only fallback on API errors
    return enforceEbayTitleLimit(title);
  }
}

// Generate keyword with no repetition and no guessing
async function generateKeyword(listingData, bookType) {
  const systemMessage = `You are an expert book metadata analyst specializing in creating searchable, practical keywords for eBay book listings. Your task is to analyze book details and generate keywords that buyers actually search for.`;
  // Extract main title (before colon) for duplicate filtering
  let mainTitle = listingData.title;
  if (listingData.title && listingData.title.includes(':')) {
    mainTitle = listingData.title.split(':')[0].trim();
  }
  const prompt = `Based on the following book metadata, generate a practical, highly searchable keyword for this book for eBay.\n\n- ALWAYS start with the most general subject (e.g., \"History\", \"Business\", \"Cooking\", \"Self-Help\") from the metadata.\n- Add ONE highly relevant enhancer (from the synopsis, title, or metadata) to make the subject more specific or relevant, if possible.\n- If space allows, and you are 95%+ confident it is highly relevant and flows naturally, add a SECOND subject or enhancer (from the book's metadata or synopsis) that is not already used and not in the title.\n- The keyword should be in the format: \"Enhancer Subject\", \"Subject Enhancer\", \"Enhancer Subject Subject2\", \"Enhancer1 Enhancer2 Subject\", or similar, as long as it reads naturally.\n- NEVER repeat words from the MAIN TITLE (before the colon) in the keyword. It is OK to use words from the subtitle (after the colon) if they are highly relevant.\n- The keyword must NOT exceed 25 characters.\n- If you do not have enough information to confidently generate a keyword, leave the response completely blank. Do NOT guess.\n- If in doubt about adding a second word, leave it out.\n- Return ONLY the keyword, with no explanation or extra text.\n\nBook Title: \"${listingData.title}\"\nAuthor: \"${listingData.author}\"\nPublisher: \"${listingData.publisher || 'Unknown'}\"\nPublication Year: \"${listingData.publicationYear || ''}\"\nSynopsis: \"${listingData.synopsis || ''}\"\nSubjects/Categories: ${listingData.subjects ? listingData.subjects.join(', ') : ''}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      max_tokens: 15,
      temperature: 0.2,
    });

    let keyword = response.choices[0].message.content.trim().replace(/^\["']|["']$/g, '').replace(/\.$/, '');
    // Only filter out words from the main title (not subtitle)
    keyword = removeDuplicateKeywordWords(mainTitle, keyword);

    if (!keyword || keyword.toLowerCase() === 'unknown' || keyword.trim() === '') {
      return '';
    }

    if (bookType === "Cookbook" && keyword.toLowerCase().includes('cookbook')) {
      keyword = keyword.replace(/cookbook/i, 'Recipes');
    }

    if (keyword.length > 25) {
      const words = keyword.split(' ');
      let smartTruncated = '';
      for (const word of words) {
        if ((smartTruncated + ' ' + word).trim().length <= 25) {
          smartTruncated = (smartTruncated + ' ' + word).trim();
        } else {
          break;
        }
      }
      return smartTruncated;
    }

    return keyword;
  } catch (error) {
    console.error('Error generating optimized keyword:', error);
    return '';
  }
}

// Remove duplicate words between title and keyword
function removeDuplicateKeywordWords(title, keyword) {
  const titleWords = new Set((title || '').toLowerCase().split(/\s+/));
  const filtered = (keyword || '').split(/\s+/).filter(word => !titleWords.has(word.toLowerCase()));
  return filtered.join(' ');
}

// Build the eBay title from components
function buildEbayTitle({ title, author, format, bookType, keyword, narrativeType }) {
  console.log('Building title with components:', { title, author, format, bookType, keyword, narrativeType });
  
  // 1. Handle main title vs subtitle
  let mainTitle = title;
  if (title.includes(':')) {
    const parts = title.split(':');
    const beforeColon = parts[0].trim();
    const afterColon = parts.slice(1).join(':').trim();
    
    // Use main title only unless it's 10 characters or less
    if (beforeColon.length > 10) {
      mainTitle = beforeColon;
      console.log(`Using main title only: "${mainTitle}" (${mainTitle.length} chars)`);
    } else {
      mainTitle = title; // Use full title if main title is short
      console.log(`Using full title (main title too short): "${mainTitle}" (${mainTitle.length} chars)`);
    }
  }
  
  // 2. Handle multiple authors - use only the first one
  let authorName = author;
  if (author && author.includes(',')) {
    authorName = author.split(',')[0].trim();
    console.log(`Using first author only: "${authorName}" (was: "${author}")`);
  }
  
  // 3. Build the title components
  let titleParts = [
    mainTitle,
    authorName ? `by ${authorName}` : '',
    format,
    bookType,
    keyword,
    narrativeType === 'Fiction' ? 'Fiction' : ''
  ];
  
  let ebayTitle = titleParts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  console.log(`Built title: "${ebayTitle}" (${ebayTitle.length} chars)`);
  
  // 4. If over 80 characters, prioritize keeping the keyword by removing other parts
  if (Buffer.byteLength(ebayTitle, 'utf8') > 80) {
    console.log(`Title too long (${ebayTitle.length} chars), optimizing for keyword...`);
    
    // Try removing "Book" type first (least important)
    let optimizedTitle = ebayTitle.replace(` ${bookType}`, '');
    if (Buffer.byteLength(optimizedTitle, 'utf8') <= 80) {
      console.log(`Removed book type, new length: ${optimizedTitle.length}`);
      return optimizedTitle;
    }
    
    // Try removing format if still too long
    optimizedTitle = optimizedTitle.replace(` ${format}`, '');
    if (Buffer.byteLength(optimizedTitle, 'utf8') <= 80) {
      console.log(`Removed format, new length: ${optimizedTitle.length}`);
      return optimizedTitle;
    }
    
    // If still too long, truncate the main title to fit the keyword
    const baseStructure = `by ${authorName} ${keyword}`;
    const availableSpace = 80 - baseStructure.length - 1; // -1 for space
    
    if (availableSpace > 0) {
      const truncatedMainTitle = mainTitle.substring(0, availableSpace).trim();
      optimizedTitle = `${truncatedMainTitle} ${baseStructure}`;
      console.log(`Truncated main title to fit keyword, new length: ${optimizedTitle.length}`);
      return optimizedTitle;
    } else {
      // Last resort: just title and author
      optimizedTitle = `${mainTitle} by ${authorName}`;
      if (Buffer.byteLength(optimizedTitle, 'utf8') > 80) {
        optimizedTitle = optimizedTitle.substring(0, 80).trim();
      }
      console.log(`Last resort: title and author only, length: ${optimizedTitle.length}`);
      return optimizedTitle;
    }
  }
  
  return ebayTitle;
}

// Update the stepwise title generation to use the correct function name
async function generateStepwiseEbayTitle(listingData) {
  console.log('=== STARTING STEPWISE TITLE GENERATION ===');
  console.log('Input data:', {
    title: listingData.title,
    author: listingData.author,
    format: listingData.format || listingData.binding
  });
  
  // Step 1: Classify narrative type (use existing function with updated prompt)
  console.log('Step 1: Classifying narrative type...');
  const narrativeType = await determineNarrativeTypeUsingGPT(listingData);
  console.log('Narrative type result:', narrativeType);
  
  // Step 2: Classify book type
  console.log('Step 2: Classifying book type...');
  const bookType = await determineBookTypeUsingGPT(listingData);
  console.log('Book type result:', bookType);
  
  // Step 3: Generate keyword
  console.log('Step 3: Generating keyword...');
  const keyword = await generateKeyword(listingData, bookType);
  console.log('Keyword result:', keyword);
  
  // Step 4: Determine format
  console.log('Step 4: Determining format...');
  let format = 'Paperback';
  if (listingData.format || listingData.binding) {
    const formatValue = (listingData.format || listingData.binding);
    const formatLower = formatValue.toLowerCase();
    if (formatLower.includes('hardcover') || formatLower.includes('hard cover') || formatLower.includes('hardback') || formatLower === 'hardcover') {
      format = 'Hardcover';
    } else if (formatLower === 'book' || formatLower === 'paperback') {
      format = 'Paperback';
    }
  }
  console.log('Format result:', format);
  
  // Step 5: Build title
  console.log('Step 5: Building title...');
  let ebayTitle = buildEbayTitle({
    title: listingData.title,
    author: listingData.author,
    format,
    bookType,
    keyword,
    narrativeType
  });
  console.log('Built title:', ebayTitle);
  console.log('Title length:', ebayTitle.length);
  
  // Step 6: AI-powered intelligent truncation if needed
  if (Buffer.byteLength(ebayTitle, 'utf8') > 80) {
    console.log(`Title exceeds 80 characters (${ebayTitle.length}), using AI truncation`);
    ebayTitle = await aiIntelligentTruncation(ebayTitle);
    console.log('After AI truncation:', ebayTitle);
    console.log('Final title length:', ebayTitle.length);
  }
  
  console.log('=== FINAL STEPWISE TITLE RESULT ===');
  console.log('Final ebayTitle:', ebayTitle);
  console.log('Final length:', ebayTitle.length);
  console.log('=== END STEPWISE TITLE GENERATION ===');
  
  return ebayTitle;
}