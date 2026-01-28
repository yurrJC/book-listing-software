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
const { VALID_EBAY_TOPICS } = require('./utils/ebayTopics.js');
const { VALID_EBAY_GENRES } = require('./utils/ebayGenres.js');
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

// Create drafts-images directory if it doesn't exist (for draft image storage)
const DRAFTS_IMAGES_DIR = path.join(__dirname, 'drafts-images');
if (!fs.existsSync(DRAFTS_IMAGES_DIR)) {
  fs.mkdirSync(DRAFTS_IMAGES_DIR, { recursive: true });
}
// Serve draft images statically
app.use('/drafts-images', express.static(DRAFTS_IMAGES_DIR));

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
 * NEW: Combined GPT function that generates book type and title in a single API call
 * This significantly speeds up the listing process while maintaining the same quality
 * 
 * @param {Object} listingData - Book metadata including title, author, subjects, and synopsis
 * @returns {Promise<Object>} - Object containing bookType and title
 */
// REMOVED: generateAllBookDataUsingGPT function - replaced with stepwise approach

/**
 * Fallback function that uses the original separate GPT calls
 * This ensures the system continues to work even if the combined call fails
 * 
 * @param {Object} listingData - Book metadata
 * @returns {Promise<Object>} - Object containing bookType and title
 */
async function fallbackToIndividualCalls(listingData) {
  console.log('========== STARTING FALLBACK TO INDIVIDUAL CALLS ==========');
  
  try {
    const bookType = await determineBookTypeUsingGPT(listingData);
    
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
    
    // Build title manually (no keyword)
    let title = `${listingData.title} by ${listingData.author} ${format} ${bookType}`;
    
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
        // If adding "Fiction" would exceed 80 chars, truncate the title
        const truncatedTitle = title.substring(0, 75).trim();
        title = `${truncatedTitle} Fiction`;
        console.log(`Truncated and added "Fiction": "${title}"`);
      }
    }
    
    // Check if title exceeds 80 characters and shorten if necessary
    if (title.length > 80) {
      title = shortenTitle(title, listingData.title, listingData.author, format, bookType);
    }
    
    console.log(`Fallback results: BookType="${bookType}", Title="${title}"`);
    console.log('========== FINISHED FALLBACK TO INDIVIDUAL CALLS ==========');
    
    return { bookType, title };
    
  } catch (error) {
    console.error('Error in fallback calls:', error);
    // Ultimate fallback
    return {
      bookType: 'Book',
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
    
    // Check if title contains colon (old ISBNdb format)
    if (listingData.title.includes(':')) {
      const parts = listingData.title.split(':');
      mainTitle = parts[0].trim();
      subtitle = parts.slice(1).join(':').trim();
    } else {
      // No colon - ISBNdb concatenated the title and subtitle
      // Use OpenAI to intelligently extract the main title
      console.log('generateCompleteEbayTitle: No colon detected - extracting main title with OpenAI...');
      mainTitle = await extractMainTitleFromConcatenatedTitle(listingData.title);
      console.log(`generateCompleteEbayTitle: Extracted main title: "${mainTitle}"`);
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
      title = `${mainTitle}: ${subtitle} by ${authorSection} ${format} ${bookType}`;
    } else {
      title = `${mainTitle} by ${authorSection} ${format} ${bookType}`;
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
        // If adding "Fiction" would exceed 80 chars, truncate the title
        const truncatedTitle = title.substring(0, 75).trim();
        title = `${truncatedTitle} Fiction`;
        console.log(`Truncated and added "Fiction": "${title}"`);
      }
    }
    
    console.log(`Directly constructed title: "${title}" (${title.length} chars)`);
    
    // Check if the title exceeds eBay's 80 character limit and shorten if necessary
    if (title.length > 80) {
      title = shortenTitle(title, mainTitle, authorSection, format, bookType);
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
 * @returns {string} - Shortened title within 80 characters
 */
function shortenTitle(fullTitle, mainTitle, author, format, bookType) {
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
  
  // STEP 2: If still too long, remove book type (but preserve "Fiction" if present)
  if (shortenedTitle.length > 80) {
    // Remove book type, but be careful not to remove "Fiction" if it's present
    if (isFiction && shortenedTitle.toLowerCase().includes('fiction')) {
      // If "Fiction" is present, just remove the book type part
      shortenedTitle = shortenedTitle.replace(` ${bookType}`, '');
    } else {
      // Remove the entire book type
      shortenedTitle = shortenedTitle.replace(` ${bookType}`, '');
    }
    
    console.log(`After removing book type: "${shortenedTitle}" (${shortenedTitle.length} chars)`);
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
  
  // STEP 3: Final intelligent trimming if needed
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
    
    // Use the imported valid eBay Topics list
    
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
${VALID_EBAY_TOPICS.join(", ")}

INSTRUCTIONS:
1. Analyze the book's title, author, synopsis, and subject categories
2. Select ONLY topics from the VALID EBAY TOPICS LIST that are relevant and commonly useful
3. Prioritize broad, commonly searched topics that work well for this type of book
4. Always include "Books" as the first topic (100% confidence)
5. Focus on topics that buyers would actually search for when looking for this book
6. For biographies, include: "Books", "Biography", and broad relevant topics (e.g., "History", "Australia", "Australian History", "Business & Money")
7. For fiction, include: "Books", "Literature", and broad genre topics (e.g., "Fiction", "Romance", "Mystery")
8. For non-fiction, include: "Books" and broad subject topics (e.g., "History", "Science", "Business & Money")
9. Always include relevant geographical/country topics (e.g., "Australia", "United States", "United Kingdom") when applicable
10. Prefer broader, more commonly used topics over very specific niche ones
11. ORDER topics by confidence level: 100% confidence first, then 95%, 90%, etc.

RESPOND WITH A JSON OBJECT containing ALL relevant valid eBay topics ordered by confidence (highest confidence first):
Format: {"topics": ["Books", "HighConfidenceTopic1", "HighConfidenceTopic2", "MediumConfidenceTopic3", "LowerConfidenceTopic4"]}
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
      
      // Filter to only include valid eBay topics
      const validTopics = topics.filter(topic => VALID_EBAY_TOPICS.includes(topic));
      
      // Ensure we have at least "Books" as a fallback
      if (!validTopics.includes("Books")) {
        validTopics.unshift("Books");
      }
      
      // Return ALL valid topics (no limit) - let AI suggest everything it's confident about
      const finalTopics = validTopics;
      
      console.log(`Determined valid eBay Topics for "${listingData.title}":`, finalTopics);
      return finalTopics;
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
 * Uses OpenAI to intelligently determine the best Store Category 2 match
 * based on book metadata, genres, topics, and available store categories
 * 
 * @param {Object} listingData - Book metadata including title, author, synopsis, etc.
 * @param {Array<string>} bookGenres - Array of book genres
 * @param {Array<string>} bookTopics - Array of book topics
 * @param {string} narrativeType - Fiction or Non-Fiction
 * @returns {Promise<string|null>} - Store Category 2 ID or null if no match
 */
async function determineStoreCategory2(listingData, bookGenres, bookTopics, narrativeType) {
  try {
    console.log('Determining Store Category 2 using OpenAI based on:', { 
      title: listingData.title,
      bookGenres, 
      bookTopics, 
      narrativeType 
    });
  
  // Build category mappings dynamically from ALL environment variables
  const categoryMappings = {};
  
  // Get all environment variables that start with EBAY_STORE_CATEGORY_
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('EBAY_STORE_CATEGORY_') && key !== 'EBAY_STORE_CATEGORY_1' && key !== 'EBAY_STORE_CATEGORY_2') {
      // Extract the category name from the key
      const categoryName = key.replace('EBAY_STORE_CATEGORY_', '').replace(/_/g, ' ');
      // Convert to proper case (e.g., "COOKBOOKS" -> "Cookbooks")
      const formattedName = categoryName.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
      categoryMappings[formattedName] = process.env[key];
      }
    });
    
    // If no category mappings exist, return null
    if (Object.keys(categoryMappings).length === 0) {
      console.log('No store category mappings found in environment variables');
      return null;
    }
    
    console.log(`Found ${Object.keys(categoryMappings).length} available store categories`);
    
    // Prepare book metadata for OpenAI
    const bookMetadata = {
      title: listingData.title,
      author: listingData.author,
      synopsis: listingData.synopsis || 'Not available',
      subjects: listingData.subjects || [],
      genres: bookGenres || [],
      topics: bookTopics || [],
      narrativeType: narrativeType || 'Unknown',
      publisher: listingData.publisher || 'Unknown',
      format: listingData.format || 'Paperback'
    };
    
    // Build the list of available categories for OpenAI
    const availableCategories = Object.entries(categoryMappings).map(([name, id]) => ({
      name: name,
      id: id
    }));
    
    const systemMessage = `You are an expert book categorization system for eBay store organization.
Your task is to select the SINGLE BEST matching store category for a book based on its metadata.
You must choose the most appropriate category from the provided list, considering the book's content, genre, topics, and narrative type.`;
    
    const prompt = `Analyze this book and select the BEST matching store category from the available options:

BOOK METADATA:
Title: ${bookMetadata.title}
Author: ${bookMetadata.author}
Narrative Type: ${bookMetadata.narrativeType}
Genres: ${bookMetadata.genres.join(', ') || 'None'}
Topics: ${bookMetadata.topics.join(', ') || 'None'}
Synopsis: ${bookMetadata.synopsis}
Subjects: ${bookMetadata.subjects.join(', ') || 'None'}

AVAILABLE STORE CATEGORIES:
${availableCategories.map(cat => `- ${cat.name} (ID: ${cat.id})`).join('\n')}

INSTRUCTIONS:
1. Analyze the book's title, synopsis, genres, topics, and narrative type
2. Select the SINGLE BEST matching category from the available list
3. Consider the book's primary focus and content
4. If the book is clearly a cookbook, choose a cookbook category
5. If the book is clearly a textbook, choose a textbook category
6. For biographies, choose a biography category if available
7. For fiction, prefer fiction-specific categories over generic ones
8. For non-fiction, match to the most relevant subject category
9. If no category is a good match, return null

RESPOND WITH A JSON OBJECT containing the selected category ID:
Format: {"categoryId": "123456"} or {"categoryId": null} if no good match exists`;
    
    // Call OpenAI API - using gpt-4o-mini for speed and cost efficiency
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt }
      ],
      temperature: 0.1, // Low temperature for consistent, precise results
      response_format: { type: "json_object" },
      max_tokens: 150, // Small response, so limit tokens for efficiency
    });
    
    // Process the OpenAI response
    try {
      const responseJson = JSON.parse(response.choices[0].message.content);
      const selectedCategoryId = responseJson.categoryId;
      
      if (!selectedCategoryId) {
        console.log('OpenAI determined no suitable store category match');
    return null;
      }
      
      // Validate that the selected category ID exists in our mappings
      const isValidCategory = Object.values(categoryMappings).includes(selectedCategoryId.toString());
      
      if (!isValidCategory) {
        console.warn(`OpenAI returned invalid category ID: ${selectedCategoryId}`);
        return null;
      }
      
      // Find the category name for logging
      const categoryName = Object.entries(categoryMappings).find(([name, id]) => id === selectedCategoryId.toString())?.[0];
      console.log(`✅ OpenAI selected Store Category 2: "${categoryName}" (ID: ${selectedCategoryId})`);
      
      return selectedCategoryId.toString();
    } catch (error) {
      console.error('Error parsing OpenAI response for store category:', error);
  return null;
    }
  } catch (error) {
    console.error('Error determining store category using OpenAI:', error);
    return null; // Fail gracefully - don't break the listing creation
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
    
    // Use the imported valid eBay Genres list
    
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
${VALID_EBAY_GENRES.join(", ")}

INSTRUCTIONS:
1. Analyze the book's title, author, synopsis, and subject categories
2. Select ONLY genres from the VALID EBAY GENRES LIST that are relevant and commonly useful
3. Prioritize broad, commonly searched genres that work well for this type of book
4. Focus on genres that buyers would actually search for when looking for this book
5. For biographies, include: "Biographies & True Stories" and broad relevant genres (e.g., "Historical", "History")
6. For fiction, include: "Fiction" and broad genre categories (e.g., "Romance", "Mystery", "Fantasy")
7. For non-fiction, include: "Non-Fiction" and broad subject genres (e.g., "History", "Science", "Business, Economics & Industry")
8. Prefer broader, more commonly used genres over very specific niche ones
9. ORDER genres by confidence level: highest confidence first, then 95%, 90%, etc.

RESPOND WITH A JSON OBJECT containing ALL relevant valid eBay genres ordered by confidence (highest confidence first):
Format: {"genres": ["HighConfidenceGenre1", "HighConfidenceGenre2", "MediumConfidenceGenre3", "LowerConfidenceGenre4"]}
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
      
      // Filter to only include valid eBay genres
      const validGenres = genres.filter(genre => VALID_EBAY_GENRES.includes(genre));
      
      // Ensure we have at least a basic fallback genre based on narrative type
      if (validGenres.length === 0) {
        if (listingData.narrativeType === "Fiction") {
          validGenres.push("Fiction");
        } else {
          validGenres.push("Non-Fiction");
        }
      }
      
      // Return ALL valid genres (no limit) - let AI suggest everything it's confident about
      const finalGenres = validGenres;
      
      console.log(`Determined valid eBay Genres for "${listingData.title}":`, finalGenres);
      return finalGenres;
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
      <p>General pre-owned wear (e.g. dog-eared corners, page indentations, yellowing/tanning, spine creasing, cover creasing, shelf wear) may be present due to prior use</p>
      <p>Some items may include a small inventory sticker from our internal cataloguing system. These are visible in the listing photos and are standard practice in book retailing.</p>
      <p>Remainder Copies – Some books may have a small marker line or dot on the page edges, occasionally touching the cover or some page edges. This is a standard mark used to indicate discounted remainder stock.</p>
      <p>Labels – Books may have secondhand or retail store labels on the covers that may have been covered (e.g., with white out).</p>
      <p>Books graded as acceptable condition may display minor cosmetic water damage. Significant damage that impairs readability is always shown separately in photographs.</p>
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

/**
 * Helper function to check if the error is the category change error
 */
function isCategoryChangeError(errors) {
  if (!errors) return false;
  
  const errorArray = Array.isArray(errors) ? errors : [errors];
  
  for (const error of errorArray) {
    const longMessage = error.LongMessage || '';
    const shortMessage = error.ShortMessage || '';
    
    if (longMessage.includes('This product belongs to a different category, so the category has been changed') ||
        shortMessage.includes('This product belongs to a different category, so the category has been changed')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Helper function to check if the error is related to author being too long
 */
// Helper function to safely extract author as string (similar to frontend)
function getAuthorAsString(authorValue) {
  // Handle null/undefined
  if (!authorValue && authorValue !== 0 && authorValue !== false) return '';
  
  // Handle string values
  if (typeof authorValue === 'string') {
    // Handle the case where it's already "[object Object]" string
    if (authorValue === '[object Object]' || authorValue.trim() === '[object Object]') {
      console.warn('Found "[object Object]" string for author, returning empty');
      return '';
    }
    return authorValue.trim();
  }
  
  // Handle arrays
  if (Array.isArray(authorValue)) {
    if (authorValue.length === 0) return '';
    // If array contains strings, join them
    if (authorValue.every(item => typeof item === 'string')) {
      return authorValue.join(', ');
    }
    // If array contains objects, try to extract names
    const names = authorValue.map(item => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        return item.name || item.author || item.title || '';
      }
      return String(item);
    }).filter(Boolean);
    return names.join(', ');
  }
  
  // Handle objects
  if (typeof authorValue === 'object' && authorValue !== null) {
    // Try common property names
    if (authorValue.name) return String(authorValue.name);
    if (authorValue.author) return String(authorValue.author);
    if (authorValue.title) return String(authorValue.title);
    
    // Try to stringify and parse
    try {
      const str = JSON.stringify(authorValue);
      // If it's a simple object with name/author, try to extract
      if (str.includes('"name"') || str.includes('"author"')) {
        const parsed = JSON.parse(str);
        return parsed.name || parsed.author || '';
      }
      // If it looks like an array was stringified, try to parse it
      if (str.startsWith('[') && str.includes('"')) {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          return parsed.map(a => typeof a === 'string' ? a : (a.name || a.author || '')).filter(Boolean).join(', ');
        }
      }
    } catch (e) {
      // JSON parsing failed, try toString
      if (authorValue.toString && authorValue.toString() !== '[object Object]') {
        return authorValue.toString();
      }
    }
    
    // Last resort: return empty rather than "[object Object]"
    console.warn('Could not extract author from object:', authorValue);
    return '';
  }
  
  // Handle other types (numbers, booleans, etc.)
  return String(authorValue);
}

function isAuthorTooLongError(errors) {
  if (!errors) return false;
  
  const errorArray = Array.isArray(errors) ? errors : [errors];
  
  for (const error of errorArray) {
    const longMessage = (error.LongMessage || '').toLowerCase();
    const shortMessage = (error.ShortMessage || '').toLowerCase();
    const errorCode = String(error.ErrorCode || '');
    
    // Combine all messages for comprehensive checking
    const allMessages = `${longMessage} ${shortMessage}`.toLowerCase();
    
    // Check if error mentions "author" and any length-related terms
    const hasAuthor = allMessages.includes('author');
    const hasLengthIssue = 
      allMessages.includes('too long') || 
      allMessages.includes('exceeds') || 
      allMessages.includes('maximum length') ||
      allMessages.includes('length limit') ||
      allMessages.includes('too many characters') ||
      allMessages.includes('maximum') ||
      allMessages.includes('limit') ||
      allMessages.includes('characters') ||
      allMessages.includes('char');
    
    if (hasAuthor && hasLengthIssue) {
      console.log('✅ Author too long error detected:', {
        longMessage: error.LongMessage,
        shortMessage: error.ShortMessage,
        errorCode: error.ErrorCode
      });
      return true;
    }
    
    // Check for specific eBay error codes related to field length (21916, 21917, etc.)
    if (errorCode && /^219\d{2}$/.test(errorCode)) {
      // These are common eBay error codes for field length issues
      if (hasAuthor) {
        console.log('✅ Author too long error detected via error code:', errorCode);
        return true;
      }
    }
    
    // Also check for "ItemSpecifics" errors that mention author
    if (allMessages.includes('itemspecifics') && hasAuthor && hasLengthIssue) {
      console.log('✅ Author too long error detected in ItemSpecifics');
      return true;
    }
  }
  
  return false;
}

/**
 * Helper function to build the eBay listing request object
 */
async function buildEbayListingRequest(listingData, options = {}) {
  const {
    includeISBN = true,
    categoryMappingAllowed = true,
    selectedCondition = 'Good',
    selectedFlawKeys = [],
    ebayTitle,
    nameValueList,
    bookTopics,
    bookGenres,
    narrativeType,
    epsImageUrls,
    authToken,
    shippingPolicyId,
    returnPolicyId,
    paymentPolicyId
  } = options;

    const requestObj = {
      '$': { xmlns: 'urn:ebay:apis:eBLBaseComponents' },
      'RequesterCredentials': {
        'eBayAuthToken': authToken
      },
      'ErrorLanguage': 'en_AU',
      'WarningLevel': 'High',
      'Item': {
        'Title': ebayTitle,
      'Description': generateBookDescription(listingData, selectedFlawKeys),
        'PrimaryCategory': {
          'CategoryID': '261186'
        },
        'StartPrice': listingData.price || '9.99',
      'CategoryMappingAllowed': categoryMappingAllowed ? 'true' : 'false',
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
      }
    }
  };

  // Only include ProductListingDetails with ISBN if includeISBN is true
  if (includeISBN && listingData.isbn) {
    requestObj.Item.ProductListingDetails = {
          'ISBN': listingData.isbn,
          'IncludePrefilledItemInformation': 'true',
          'UseStockPhotoURLAsGallery': 'false'
    };
  }

    // Add Store Categories if configured
    const storeCategory1 = process.env.EBAY_STORE_CATEGORY_1 || listingData.storeCategory1;
  const defaultStoreCategory2 = process.env.EBAY_STORE_CATEGORY_2 || null;
  let storeCategory2 = listingData.storeCategory2 || null;
    
    // Auto-assign Category 2 based on book genre/topic if not explicitly set
    if (!storeCategory2) {
      const autoCat2 = await determineStoreCategory2(listingData, bookGenres, bookTopics, narrativeType);
      if (autoCat2) {
        storeCategory2 = autoCat2;
        console.log(`Auto-assigned Store Category 2 based on book content: ${storeCategory2}`);
      } else if (defaultStoreCategory2) {
      storeCategory2 = defaultStoreCategory2;
        console.log(`Using default Store Category 2 fallback: ${storeCategory2}`);
      }
    }
    
    if (storeCategory1 || storeCategory2) {
      requestObj.Item.Storefront = {};
      
      if (storeCategory1) {
        requestObj.Item.Storefront.StoreCategoryID = storeCategory1;
        console.log(`Adding Store Category 1: ${storeCategory1}`);
      }
      
      if (storeCategory2) {
        requestObj.Item.Storefront.StoreCategory2ID = storeCategory2;
        console.log(`Adding Store Category 2: ${storeCategory2}`);
      }
    }

  // Add SKU at the Item level if provided
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

  return requestObj;
}

/**
 * Helper function to submit the listing to eBay
 */
async function submitEbayListing(requestObj, appId, devId, certId) {
  const builder = new xml2js.Builder({
    rootName: 'AddItemRequest',
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    headless: false
  });
    
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
  
  return result;
}

async function submitEbayValidation(requestObj, appId, devId, certId) {
  const builder = new xml2js.Builder({
    rootName: 'VerifyAddItemRequest',
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    headless: false
  });
    
    const xml = builder.buildObject(requestObj);
    
    console.log('VerifyAddItem XML Payload:', xml);
    
    const apiEndpoint = isProduction
  ? 'https://api.ebay.com/ws/api.dll'
  : 'https://api.sandbox.ebay.com/ws/api.dll';

console.log(`Validating eBay listing at: ${apiEndpoint}`);

const response = await axios({
  method: 'post',
  url: apiEndpoint,
  headers: {
    'X-EBAY-API-CALL-NAME': 'VerifyAddItem',
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
    
    console.log('eBay VerifyAddItem Response:', result);
  
  return result;
}

async function validateEbayListing(listingData) {
  try {
    console.log('Validating eBay listing data:', listingData);
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
    // Use user-selected topic and genre, or fallback to AI generation if not provided
    let bookTopics = [];
    let bookGenres = [];
    let narrativeType = '';
    
    if (listingData.selectedTopic && listingData.selectedGenre) {
      // Use user-selected values, but still determine narrative type for the item specific
      bookTopics = [listingData.selectedTopic];
      bookGenres = [listingData.selectedGenre];
      narrativeType = await determineNarrativeTypeUsingGPT(listingData);
      listingData.narrativeType = narrativeType;
      console.log(`✅ Using user-selected values:
       - Topic: "${listingData.selectedTopic}"
       - Genre: "${listingData.selectedGenre}"
       - Narrative Type: "${narrativeType}"`);
    } else {
      // Fallback to AI generation (for backwards compatibility)
      console.log('User selections not provided, falling back to AI generation...');
      narrativeType = await determineNarrativeTypeUsingGPT(listingData);
      listingData.narrativeType = narrativeType;
      bookTopics = await determineBookTopicsUsingGPT(listingData);
      bookGenres = await determineBookGenresUsingGPT(listingData);
      console.log(`AI-generated categorization results:
     - Narrative Type: ${narrativeType}
     - Topics (${bookTopics.length}): ${bookTopics.join(', ')}
     - Genres (${bookGenres.length}): ${bookGenres.join(', ')}`);
    }
    
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
    
    // Build the base ItemSpecifics NameValueList
    const nameValueList = [
      { 'Name': 'Format', 'Value': listingData.format || 'Paperback' },
      { 'Name': 'Author', 'Value': listingData.author },
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

    // Try validation with ISBN first
    let requestObj = await buildEbayListingRequest(listingData, {
      includeISBN: true,
      categoryMappingAllowed: true,
      selectedCondition,
      selectedFlawKeys,
      ebayTitle,
      nameValueList,
      bookTopics,
      bookGenres,
      narrativeType,
      epsImageUrls,
      authToken,
      shippingPolicyId,
      returnPolicyId,
      paymentPolicyId
    });

    let result = await submitEbayValidation(requestObj, appId, devId, certId);
    
    // Check if we got the category change error
    if (result.VerifyAddItemResponse && result.VerifyAddItemResponse.Ack !== 'Success' && 
        result.VerifyAddItemResponse.Ack !== 'Warning' &&
        isCategoryChangeError(result.VerifyAddItemResponse.Errors)) {
      
      console.log('⚠️ Category change error detected. Retrying without ISBN and forcing book category...');
      
      // Retry without ISBN and with category mapping disabled
      requestObj = await buildEbayListingRequest(listingData, {
        includeISBN: false, // Don't include ISBN
        categoryMappingAllowed: false, // Force the category
        selectedCondition,
        selectedFlawKeys,
        ebayTitle,
        nameValueList,
        bookTopics,
        bookGenres,
        narrativeType,
        epsImageUrls,
        authToken,
        shippingPolicyId,
        returnPolicyId,
        paymentPolicyId
      });

      result = await submitEbayValidation(requestObj, appId, devId, certId);
    }
    
    // Clean up uploaded images after validation (they're not needed if we're just validating)
    deleteUploadedImages(imagesToDelete);
    
    if (result.VerifyAddItemResponse && (result.VerifyAddItemResponse.Ack === 'Success' || 
        result.VerifyAddItemResponse.Ack === 'Warning')) {
      return {
        success: true
      };
    } else {
      console.error('eBay Validation Error:', result.VerifyAddItemResponse?.Errors || result.Errors);
      return {
        success: false,
        errors: result.VerifyAddItemResponse?.Errors || result.Errors
      };
    }
  } catch (error) {
    console.error('Error validating eBay listing:', error);
    return {
      success: false,
      error: error.message
    };
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
    // Use user-selected topic and genre, or fallback to AI generation if not provided
    let bookTopics = [];
    let bookGenres = [];
    let narrativeType = '';
    
    if (listingData.selectedTopic && listingData.selectedGenre) {
      // Use user-selected values, but still determine narrative type for the item specific
      bookTopics = [listingData.selectedTopic];
      bookGenres = [listingData.selectedGenre];
      narrativeType = await determineNarrativeTypeUsingGPT(listingData);
      listingData.narrativeType = narrativeType;
      console.log(`✅ Using user-selected values:
       - Topic: "${listingData.selectedTopic}"
       - Genre: "${listingData.selectedGenre}"
       - Narrative Type: "${narrativeType}"`);
    } else {
      // Fallback to AI generation (for backwards compatibility)
      console.log('User selections not provided, falling back to AI generation...');
      narrativeType = await determineNarrativeTypeUsingGPT(listingData);
      listingData.narrativeType = narrativeType;
      bookTopics = await determineBookTopicsUsingGPT(listingData);
      bookGenres = await determineBookGenresUsingGPT(listingData);
      console.log(`AI-generated categorization results:
     - Narrative Type: ${narrativeType}
     - Topics (${bookTopics.length}): ${bookTopics.join(', ')}
     - Genres (${bookGenres.length}): ${bookGenres.join(', ')}`);
    }
    
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
    
    // Build the base ItemSpecifics NameValueList
    const nameValueList = [
      { 'Name': 'Format', 'Value': listingData.format || 'Paperback' },
      { 'Name': 'Author', 'Value': listingData.author },
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

    // Try listing with ISBN first
    let requestObj = await buildEbayListingRequest(listingData, {
      includeISBN: true,
      categoryMappingAllowed: true,
      selectedCondition,
      selectedFlawKeys,
      ebayTitle,
      nameValueList,
      bookTopics,
      bookGenres,
      narrativeType,
      epsImageUrls,
      authToken,
      shippingPolicyId,
      returnPolicyId,
      paymentPolicyId
    });

    let result = await submitEbayListing(requestObj, appId, devId, certId);
    
    // Check if we got the category change error
    if (result.AddItemResponse.Ack !== 'Success' && 
        result.AddItemResponse.Ack !== 'Warning' &&
        isCategoryChangeError(result.AddItemResponse.Errors)) {
      
      console.log('⚠️ Category change error detected. Retrying without ISBN and forcing book category...');
      
      // Retry without ISBN and with category mapping disabled
      requestObj = await buildEbayListingRequest(listingData, {
        includeISBN: false, // Don't include ISBN
        categoryMappingAllowed: false, // Force the category
        selectedCondition,
        selectedFlawKeys,
        ebayTitle,
        nameValueList,
        bookTopics,
        bookGenres,
        narrativeType,
        epsImageUrls,
        authToken,
        shippingPolicyId,
        returnPolicyId,
        paymentPolicyId
      });

      result = await submitEbayListing(requestObj, appId, devId, certId);
    }
    
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

// API endpoint to get store category configuration
app.get('/api/storeCategories', (req, res) => {
  try {
    const config = {
      storeCategory1: process.env.EBAY_STORE_CATEGORY_1 || '',
      storeCategory2: process.env.EBAY_STORE_CATEGORY_2 || '',
      // Predefined category mappings for automatic assignment
      categoryMappings: {
        'Fiction': process.env.EBAY_STORE_CATEGORY_FICTION || '',
        'Non-Fiction': process.env.EBAY_STORE_CATEGORY_NON_FICTION || '',
        'Cookbook': process.env.EBAY_STORE_CATEGORY_COOKBOOK || '',
        'Textbook': process.env.EBAY_STORE_CATEGORY_TEXTBOOK || '',
        'Biography': process.env.EBAY_STORE_CATEGORY_BIOGRAPHY || '',
        'History': process.env.EBAY_STORE_CATEGORY_HISTORY || '',
        'Science': process.env.EBAY_STORE_CATEGORY_SCIENCE || '',
        'Art': process.env.EBAY_STORE_CATEGORY_ART || '',
        'Psychology': process.env.EBAY_STORE_CATEGORY_PSYCHOLOGY || '',
        'Business': process.env.EBAY_STORE_CATEGORY_BUSINESS || ''
      }
    };
    
    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error getting store category configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get store category configuration'
    });
  }
});

// API endpoint to get topic and genre suggestions for a book
app.post('/api/getTopicGenreSuggestions', async (req, res) => {
  try {
    console.log('Getting topic and genre suggestions for book:', req.body.title);
    
    const { title, author, synopsis, subjects, publisher, format, language, publicationYear } = req.body;
    
    if (!title) {
      return res.status(400).json({ success: false, error: 'Book title is required' });
    }
    
    // Create listingData object for the AI functions
    const listingData = {
      title,
      author: author || '',
      synopsis: synopsis || '',
      subjects: subjects || [],
      publisher: publisher || '',
      format: format || 'Paperback',
      language: language || 'English',
      publicationYear: publicationYear || ''
    };
    
    // Determine narrative type first
    const narrativeType = await determineNarrativeTypeUsingGPT(listingData);
    listingData.narrativeType = narrativeType;
    
    // Get AI suggestions for topics and genres
    const [bookTopics, bookGenres] = await Promise.all([
      determineBookTopicsUsingGPT(listingData),
      determineBookGenresUsingGPT(listingData)
    ]);
    
    console.log(`AI suggestions - Topics: ${bookTopics.join(', ')}, Genres: ${bookGenres.join(', ')}`);
    
    // Return the suggestions along with the full lists for manual selection
    res.json({
      success: true,
      suggestions: {
        topics: bookTopics,
        genres: bookGenres
      },
      narrativeType,
      allValidTopics: VALID_EBAY_TOPICS,
      allValidGenres: VALID_EBAY_GENRES
    });
    
  } catch (error) {
    console.error('Error getting topic/genre suggestions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate topic and genre suggestions' 
    });
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
        customDescriptionNote, // Custom description note from frontend
        selectedTopic, // User-selected topic
        selectedGenre // User-selected genre
    } = req.body;

    // Debug: Log the received topic and genre selections
    console.log('🔍 Received topic/genre selections:');
    console.log('  - selectedTopic:', selectedTopic);
    console.log('  - selectedGenre:', selectedGenre);

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
      customDescriptionNote: customDescriptionNote || '', // Custom description note
      selectedTopic: selectedTopic || '', // User-selected topic
      selectedGenre: selectedGenre || '' // User-selected genre
    };

    // --- Validate Required eBay Fields ---
    console.log('Validating required eBay fields...');
    
    // Ensure Language has a default value
    if (!listingData.language || listingData.language.trim() === '') {
      listingData.language = 'English';
      console.log('⚠️ Language was missing, defaulting to English');
    }
    
    const requiredFields = {
      author: listingData.author,
      title: listingData.title,
      language: listingData.language
    };
    
    const missingFields = [];
    if (!requiredFields.author || requiredFields.author.trim() === '') {
      missingFields.push('Author');
    }
    if (!requiredFields.title || requiredFields.title.trim() === '') {
      missingFields.push('Book Title');
    }
    if (!requiredFields.language || requiredFields.language.trim() === '') {
      missingFields.push('Language');
    }
    
    if (missingFields.length > 0) {
      const errorMessage = `Missing required eBay fields: ${missingFields.join(', ')}. Please provide these fields to continue.`;
      console.error('❌ Required field validation failed:', errorMessage);
      return res.status(400).json({
        success: false,
        error: errorMessage,
        missingFields: missingFields,
        requiresManualInput: true,
        currentData: {
          author: listingData.author || '',
          title: listingData.title || '',
          language: listingData.language || 'English'
        }
      });
    }
    
    console.log('✅ Required eBay fields validation passed:', {
      author: requiredFields.author,
      title: requiredFields.title,
      language: requiredFields.language
    });

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
         
         // Check if this is an "author too long" error
         if (listingResponse?.errors && isAuthorTooLongError(listingResponse.errors)) {
           console.log('⚠️ Author too long error detected. Requesting user to edit author.');
           return res.status(400).json({
             success: false,
             error: errorMessage,
             requiresAuthorEdit: true,
             currentData: {
               author: author || '',
               title: title || '',
               language: language || 'English'
             },
             details: listingResponse?.errors
           });
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
      console.log('📤 Response metadata topics:', listingResponse?.metadata?.topics);
      console.log('📤 Response metadata genres:', listingResponse?.metadata?.genres);
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

// ===== DRAFT STORAGE SYSTEM =====
const DRAFTS_FILE = path.join(__dirname, 'drafts.json');

// Helper functions for draft storage
function loadDrafts() {
  try {
    if (fs.existsSync(DRAFTS_FILE)) {
      const data = fs.readFileSync(DRAFTS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error loading drafts:', error);
    return [];
  }
}

function saveDrafts(drafts) {
  try {
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving drafts:', error);
    return false;
  }
}

// Helper function to delete a draft's image directory
function deleteDraftImages(draftId) {
  try {
    const draftImageDir = path.join(DRAFTS_IMAGES_DIR, draftId);
    if (fs.existsSync(draftImageDir)) {
      fs.rmSync(draftImageDir, { recursive: true, force: true });
      console.log(`Deleted image directory for draft ${draftId}`);
    }
  } catch (error) {
    console.error(`Error deleting images for draft ${draftId}:`, error);
  }
}

// API endpoint to validate draft before saving
app.post('/api/validateDraft', upload.fields([{ name: 'imageFiles', maxCount: 24 }]), async (req, res) => {
  try {
    const imageFileObjects = req.files?.imageFiles || [];
    const {
      isbn, price, sku, customTitle, selectedCondition, ocrText,
      title, author, publisher, publicationYear, synopsis, language,
      format, subjects, ebayTitle, customDescriptionNote,
      selectedTopic, selectedGenre
    } = req.body;

    let selectedFlawKeys = [];
    try {
      if (req.body.selectedFlawKeys) {
        selectedFlawKeys = JSON.parse(req.body.selectedFlawKeys);
        if (!Array.isArray(selectedFlawKeys)) selectedFlawKeys = [];
      }
    } catch (e) {
      console.error("Failed to parse selectedFlawKeys:", e);
    }

    let parsedSubjects = [];
    try {
      if (subjects && typeof subjects === 'string') {
        parsedSubjects = JSON.parse(subjects);
        if (!Array.isArray(parsedSubjects)) parsedSubjects = [];
      } else if (Array.isArray(subjects)) {
        parsedSubjects = subjects;
      }
    } catch(e) {
      parsedSubjects = [];
    }

    // --- Validation ---
    if (!isbn || !isValidISBN(isbn)) return res.status(400).json({ success: false, error: 'Valid ISBN is required' });
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) return res.status(400).json({ success: false, error: 'Valid price is required' });
    if (imageFileObjects.length === 0) return res.status(400).json({ success: false, error: 'At least one image file is required' });
    if (!selectedCondition || !EBAY_CONDITION_MAP[selectedCondition]) return res.status(400).json({ success: false, error: 'A valid condition selection is required' });
    
    // --- Prepare listingData ---
    const listingData = {
      isbn, price, sku: sku || '', customTitle, selectedCondition,
      selectedFlawKeys, ocrText: ocrText || '',
      imageFiles: imageFileObjects,
      title: title || '', author: author || '', publisher: publisher || '', publicationYear,
      synopsis: synopsis || '', language: language || '', format: format || 'Paperback',
      subjects: parsedSubjects,
      ebayTitle, customDescriptionNote: customDescriptionNote || '',
      selectedTopic: selectedTopic || '', selectedGenre: selectedGenre || ''
    };

    // --- Validate Required eBay Fields ---
    console.log('Validating required eBay fields...');
    
    // Ensure Language has a default value
    if (!listingData.language || listingData.language.trim() === '') {
      listingData.language = 'English';
      console.log('⚠️ Language was missing, defaulting to English');
    }
    
    const requiredFields = {
      author: listingData.author,
      title: listingData.title,
      language: listingData.language
    };
    
    const missingFields = [];
    if (!requiredFields.author || requiredFields.author.trim() === '') {
      missingFields.push('Author');
    }
    if (!requiredFields.title || requiredFields.title.trim() === '') {
      missingFields.push('Book Title');
    }
    if (!requiredFields.language || requiredFields.language.trim() === '') {
      missingFields.push('Language');
    }
    
    if (missingFields.length > 0) {
      const errorMessage = `Missing required eBay fields: ${missingFields.join(', ')}. Please provide these fields to continue.`;
      console.error('❌ Required field validation failed:', errorMessage);
      return res.status(400).json({
        success: false,
        error: errorMessage,
        missingFields: missingFields,
        requiresManualInput: true,
        currentData: {
          author: listingData.author || '',
          title: listingData.title || '',
          language: listingData.language || 'English'
        }
      });
    }
    
    console.log('✅ Required eBay fields validation passed:', {
      author: requiredFields.author,
      title: requiredFields.title,
      language: requiredFields.language
    });

    // --- Validate with eBay ---
    console.log('Calling validateEbayListing with prepared data...');
    const validationResponse = await validateEbayListing(listingData);
    console.log('Received response from validateEbayListing:', validationResponse);

    // --- Check success / Send Response ---
    if (!validationResponse || !validationResponse.success) {
      console.error('validateEbayListing indicated failure:', validationResponse);
      let statusCode = 500;
      let errorMessage = validationResponse?.error || 'Failed to validate listing with eBay.';
      if (validationResponse?.errors) {
        const ebayError = Array.isArray(validationResponse.errors) ? validationResponse.errors[0] : validationResponse.errors;
        if (ebayError?.SeverityCode === 'Error') statusCode = 400;
        errorMessage = ebayError?.LongMessage || ebayError?.ShortMessage || errorMessage;
      }
      
      // Check if this is an "author too long" error
      if (validationResponse?.errors && isAuthorTooLongError(validationResponse.errors)) {
        console.log('⚠️ Author too long error detected. Requesting user to edit author.');
        // Ensure author is a string, not an object
        let authorString = author || '';
        if (typeof authorString !== 'string') {
          if (Array.isArray(authorString)) {
            authorString = authorString.join(', ');
          } else if (typeof authorString === 'object' && authorString !== null) {
            authorString = authorString.name || authorString.author || JSON.stringify(authorString);
          } else {
            authorString = String(authorString);
          }
        }
        return res.status(400).json({
          success: false,
          error: errorMessage,
          requiresAuthorEdit: true,
          currentData: {
            author: authorString,
            title: title || '',
            language: language || 'English'
          },
          details: validationResponse?.errors
        });
      }
      
      return res.status(statusCode).json({
        success: false,
        error: errorMessage,
        details: validationResponse?.errors
      });
    } else {
      // SUCCESS: validation passed
      console.log('Sending success response from /api/validateDraft');
      res.json({
        success: true
      });
    }

  } catch (error) {
    console.error('!!! Unexpected error in /api/validateDraft endpoint handler !!!');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: `Validation failed unexpectedly: ${error.message || 'Unknown server error'}`
    });
  }
});

// API endpoint to save draft
app.post('/api/saveDraft', upload.fields([{ name: 'imageFiles', maxCount: 24 }]), async (req, res) => {
  try {
    const imageFileObjects = req.files?.imageFiles || [];
    const {
      isbn, price, sku, customTitle, selectedCondition, ocrText,
      title, author, publisher, publicationYear, synopsis, language,
      format, subjects, ebayTitle, customDescriptionNote,
      selectedTopic, selectedGenre
    } = req.body;

    let selectedFlawKeys = [];
    try {
      if (req.body.selectedFlawKeys) {
        selectedFlawKeys = JSON.parse(req.body.selectedFlawKeys);
        if (!Array.isArray(selectedFlawKeys)) selectedFlawKeys = [];
      }
    } catch (e) {
      console.error("Failed to parse selectedFlawKeys:", e);
    }

    let parsedSubjects = [];
    try {
      if (subjects && typeof subjects === 'string') {
        parsedSubjects = JSON.parse(subjects);
        if (!Array.isArray(parsedSubjects)) parsedSubjects = [];
      } else if (Array.isArray(subjects)) {
        parsedSubjects = subjects;
      }
    } catch(e) {
      parsedSubjects = [];
    }

    // Generate draft ID first
    const draftId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    
    // Create directory for this draft's images
    const draftImageDir = path.join(DRAFTS_IMAGES_DIR, draftId);
    if (!fs.existsSync(draftImageDir)) {
      fs.mkdirSync(draftImageDir, { recursive: true });
    }
    
    // Save images as files instead of base64
    const imageFileNames = [];
    const imagePaths = [];
    
    for (let i = 0; i < imageFileObjects.length; i++) {
      const file = imageFileObjects[i];
      try {
        if (!file || !file.path) {
          console.warn('Skipping invalid file object:', file);
          continue;
        }
        
        if (!fs.existsSync(file.path)) {
          console.warn('File path does not exist:', file.path);
          continue;
        }
        
        // Get file extension from original name or mimetype
        const originalName = file.originalname || file.filename || 'image.jpg';
        const ext = path.extname(originalName) || (file.mimetype?.includes('png') ? '.png' : '.jpg');
        const imageFileName = `image_${i + 1}${ext}`;
        const targetPath = path.join(draftImageDir, imageFileName);
        
        // Copy file to draft images directory
        fs.copyFileSync(file.path, targetPath);
        
        imageFileNames.push(originalName);
        imagePaths.push(imageFileName); // Store relative path within draft directory
        
        // Delete temporary file
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.warn('Could not delete temporary file:', file.path, unlinkError);
        }
      } catch (fileError) {
        console.error('Error processing file:', fileError);
        // Continue with other files even if one fails
      }
    }
    
    if (imagePaths.length === 0) {
      // Clean up empty directory if no images were saved
      try {
        fs.rmSync(draftImageDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
      return res.status(400).json({ success: false, error: 'No valid image files were provided' });
    }

    // Ensure author is a string, not an object
    let authorString = author || '';
    if (typeof authorString !== 'string') {
      if (Array.isArray(authorString)) {
        authorString = authorString.join(', ');
      } else if (typeof authorString === 'object' && authorString !== null) {
        authorString = authorString.name || authorString.author || JSON.stringify(authorString);
      } else {
        authorString = String(authorString);
      }
    }
    // Also check if it's the string "[object Object]" and handle it
    if (authorString === '[object Object]') {
      console.warn('⚠️ Received "[object Object]" as author string, attempting to recover from metadata');
      authorString = '';
    }

    const draft = {
      id: draftId,
      timestamp: new Date().toISOString(),
      isbn: isbn || '',
      price: price,
      sku: sku || '',
      selectedCondition: selectedCondition,
      selectedFlawKeys: selectedFlawKeys,
      ocrText: ocrText || '',
      listingTitle: customTitle || ebayTitle || '',
      ebayTitle: ebayTitle || '',
      customTitle: customTitle || null,
      metadata: {
        title: title || '',
        author: authorString,
        publisher: publisher || '',
        publicationYear: publicationYear || '',
        synopsis: synopsis || '',
        language: language || '',
        format: format || 'Paperback',
        subjects: parsedSubjects,
        coverUrl: null
      },
      customDescriptionNote: customDescriptionNote || '',
      selectedTopic: selectedTopic || '',
      selectedGenre: selectedGenre || '',
      // Store image paths instead of base64
      imagePaths: imagePaths,
      imageFileNames: imageFileNames
    };

    const drafts = loadDrafts();
    drafts.push(draft);
    saveDrafts(drafts);

    res.json({ success: true, draftId: draft.id });
  } catch (error) {
    console.error('Error saving draft:', error);
    const errorMessage = error?.message || error?.toString() || 'An unknown error occurred while saving the draft';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// API endpoint to get all drafts
app.get('/api/drafts', (req, res) => {
  try {
    const drafts = loadDrafts();
    // Don't send full images in list - just metadata
    const draftsList = drafts.map(draft => ({
      id: draft.id,
      timestamp: draft.timestamp,
      isbn: draft.isbn,
      price: draft.price,
      sku: draft.sku,
      listingTitle: draft.listingTitle,
      metadata: draft.metadata,
      selectedTopic: draft.selectedTopic,
      selectedGenre: draft.selectedGenre,
      // Support both old (base64) and new (file paths) formats
      hasImages: (draft.imagePaths && draft.imagePaths.length > 0) || (draft.imageBase64Array && draft.imageBase64Array.length > 0),
      imageCount: draft.imagePaths ? draft.imagePaths.length : (draft.imageBase64Array ? draft.imageBase64Array.length : 0)
    }));
    res.json({ success: true, drafts: draftsList });
  } catch (error) {
    console.error('Error loading drafts:', error);
    const errorMessage = error?.message || error?.toString() || 'An unknown error occurred while loading drafts';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// API endpoint to get a specific draft with images
app.get('/api/drafts/:id', (req, res) => {
  try {
    const drafts = loadDrafts();
    const draft = drafts.find(d => d.id === req.params.id);
    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    
    // Convert image paths to URLs for new format, or keep base64 for old format
    const draftResponse = { ...draft };
    
    if (draft.imagePaths && draft.imagePaths.length > 0) {
      // New format: convert paths to URLs
      const baseUrl = req.protocol + '://' + req.get('host');
      draftResponse.imageUrls = draft.imagePaths.map(imgPath => 
        `${baseUrl}/drafts-images/${draft.id}/${imgPath}`
      );
      // Remove imagePaths from response (frontend uses imageUrls)
      delete draftResponse.imagePaths;
      console.log(`Draft ${draft.id}: Converted ${draft.imagePaths.length} image paths to URLs`);
    } else if (draft.imageBase64Array && draft.imageBase64Array.length > 0) {
      // Old format: keep base64 for backward compatibility
      // No conversion needed - imageBase64Array is already in the response
      console.log(`Draft ${draft.id}: Using old base64 format with ${draft.imageBase64Array.length} images`);
    } else {
      // No images found - log warning
      console.warn(`Draft ${draft.id}: No images found (no imagePaths or imageBase64Array)`);
    }
    
    res.json({ success: true, draft: draftResponse });
  } catch (error) {
    console.error('Error loading draft:', error);
    const errorMessage = error?.message || error?.toString() || 'An unknown error occurred while loading the draft';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// API endpoint to delete a draft
app.delete('/api/drafts/:id', (req, res) => {
  try {
    const draftId = req.params.id;
    const drafts = loadDrafts();
    const filteredDrafts = drafts.filter(d => d.id !== draftId);
    saveDrafts(filteredDrafts);
    
    // Delete associated image files
    deleteDraftImages(draftId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting draft:', error);
    const errorMessage = error?.message || error?.toString() || 'An unknown error occurred while deleting the draft';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// API endpoint to delete multiple drafts
app.post('/api/drafts/delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'ids must be an array' });
    }
    const drafts = loadDrafts();
    const filteredDrafts = drafts.filter(d => !ids.includes(d.id));
    
    // Delete image files for all deleted drafts
    ids.forEach(draftId => {
      deleteDraftImages(draftId);
    });
    
    saveDrafts(filteredDrafts);
    res.json({ success: true, deleted: drafts.length - filteredDrafts.length });
  } catch (error) {
    console.error('Error deleting drafts:', error);
    const errorMessage = error?.message || error?.toString() || 'An unknown error occurred while deleting drafts';
    res.status(500).json({ success: false, error: errorMessage });
  }
});
// ===== END DRAFT STORAGE SYSTEM =====

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
  
  // Extract the base title (everything before the book type)
  const parts = cleanTitle.split(' ');
  const byIndex = parts.findIndex(word => word.toLowerCase() === 'by');
  
  if (byIndex !== -1 && byIndex + 2 < parts.length) {
    // Find where the book type starts (after "by Author Format")
    const bookTypeStartIndex = byIndex + 3; // by + author + format
    const baseTitle = parts.slice(0, bookTypeStartIndex).join(' ');
    const bookType = parts.slice(bookTypeStartIndex).join(' ');
    
    // Simple truncation approach - remove book type if too long
    if (Buffer.byteLength(baseTitle, 'utf8') <= 80) {
      return baseTitle;
    } else {
      console.log(`Base title too long, removing book type`);
      // Remove book type and check if that fits
      const titleWithoutBookType = parts.slice(0, bookTypeStartIndex).join(' ');
      if (Buffer.byteLength(titleWithoutBookType, 'utf8') <= 80) {
        return titleWithoutBookType;
      }
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
  const prompt = `\nThe following eBay title is ${title.length} characters long, which exceeds eBay's 80-character limit.\n\nTitle: "${title}"\n\nPlease truncate this title intelligently to fit within 80 characters while following these rules:\n- Keep the most important words (first words)\n- Avoid awkward endings (no partial words)\n- Preserve the core meaning\n- Always end with complete words\n- If the title is "Title by Author Format BookType", prioritize keeping the title and author\n- The result MUST be 80 characters or less\n\nReturn ONLY the truncated title, with no explanation or extra text.`;
  
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
  } else {
    // No colon - ISBNdb concatenated the title, use OpenAI to extract main title
    console.log('generateKeyword: No colon detected - extracting main title with OpenAI...');
    mainTitle = await extractMainTitleFromConcatenatedTitle(listingData.title);
    console.log(`generateKeyword: Extracted main title: "${mainTitle}"`);
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

/**
 * Extracts the main title from a concatenated book title using OpenAI
 * ISBNdb now returns titles without colons, so we need to intelligently separate main title from subtitle
 * 
 * Rules:
 * - Extract only the main title (what would be before the colon originally)
 * - Exception: If the main title is just one word, keep the subtitle
 * 
 * @param {string} fullTitle - The full concatenated title from ISBNdb
 * @returns {Promise<string>} - The extracted main title
 */
async function extractMainTitleFromConcatenatedTitle(fullTitle) {
  // First, check if title already contains a colon (old format)
  if (fullTitle.includes(':')) {
    const parts = fullTitle.split(':');
    const mainTitle = parts[0].trim();
    // If main title is just one word, return the full title
    if (mainTitle.split(/\s+/).length === 1) {
      return fullTitle;
    }
    return mainTitle;
  }

  // If no colon, use OpenAI to intelligently extract the main title
  try {
    console.log(`Extracting main title from: "${fullTitle}"`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using low-cost model for this task
      messages: [
        { 
          role: "system", 
          content: `You are an expert at analyzing book titles. Your task is to extract the main title from a concatenated book title where the main title and subtitle have been merged together without punctuation.

Rules:
1. Return ONLY the main title (the primary part that would appear before a colon in the original formatted title)
2. Exception: If the main title is just ONE word, return the ENTIRE title including the subtitle
3. Remove any subtitle information that appears after the main title
4. Return only the extracted title, no explanations or additional text

Examples:
Input: "The Great Gatsby A Classic Tale of the Roaring Twenties"
Output: "The Great Gatsby"

Input: "War A Comprehensive Analysis of Modern Warfare"
Output: "War A Comprehensive Analysis of Modern Warfare" (one word, return entire title)

Input: "War and Peace A Russian Epic"
Output: "War and Peace" (one main title phrase, return this)

Input: "Python Programming A Beginners Guide"
Output: "Python Programming" (main title is two words)

Input: "Machine A Visual Guide to Technology"
Output: "Machine A Visual Guide to Technology" (one word, return entire title)

Now process this title:` 
        },
        { 
          role: "user", 
          content: fullTitle 
        }
      ],
      temperature: 0.3,
      max_tokens: 100
    });

    const extractedTitle = response.choices[0].message.content.trim();
    console.log(`Extracted main title: "${extractedTitle}"`);
    return extractedTitle;

  } catch (error) {
    console.error('Error extracting main title with OpenAI:', error);
    // Fallback: try simple heuristics if OpenAI fails
    return fallbackExtractMainTitle(fullTitle);
  }
}

/**
 * Fallback method to extract main title using simple heuristics
 * Used when OpenAI API call fails
 */
function fallbackExtractMainTitle(fullTitle) {
  console.log(`Using fallback title extraction for: "${fullTitle}"`);
  
  // Split by common subtitle indicators
  const subtitleIndicators = [' A ', ' An ', ' The ', ' How to ', ' Guide to ', ' Complete ', ' Comprehensive ', ' The Story of ', ' The History of '];
  
  for (const indicator of subtitleIndicators) {
    const index = fullTitle.indexOf(indicator);
    if (index > 0) {
      const mainTitle = fullTitle.substring(0, index).trim();
      // If main title is just one word, return full title
      if (mainTitle.split(/\s+/).length === 1) {
        return fullTitle;
      }
      return mainTitle;
    }
  }
  
  // If no subtitle indicator found, assume first 5 words is main title
  const words = fullTitle.split(/\s+/);
  if (words.length === 1) {
    return fullTitle;
  }
  
  // Try first 3-5 words as main title
  const mainTitle = words.slice(0, Math.min(5, words.length)).join(' ');
  console.log(`Fallback extracted main title: "${mainTitle}"`);
  return mainTitle;
}

// Build the eBay title from components
async function buildEbayTitle({ title, author, format, bookType, narrativeType }) {
  console.log('Building title with components:', { title, author, format, bookType, narrativeType });
  
  // 1. Handle main title vs subtitle
  let mainTitle = title;
  
  // First check if title contains colon (old ISBNdb format)
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
  } else {
    // No colon - ISBNdb concatenated the title and subtitle
    // Use OpenAI to intelligently extract the main title
    console.log('No colon detected in title - extracting main title with OpenAI...');
    mainTitle = await extractMainTitleFromConcatenatedTitle(title);
    console.log(`Extracted main title: "${mainTitle}"`);
  }
  
  // 2. Handle multiple authors - use only the first one
  let authorName = author;
  if (author && author.includes(',')) {
    authorName = author.split(',')[0].trim();
    console.log(`Using first author only: "${authorName}" (was: "${author}")`);
  }
  
  // 3. Build the title components (no keyword)
  let titleParts = [
    mainTitle,
    authorName ? `by ${authorName}` : '',
    format,
    bookType,
    narrativeType === 'Fiction' ? 'Fiction' : ''
  ];
  
  let ebayTitle = titleParts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  console.log(`Built title: "${ebayTitle}" (${ebayTitle.length} chars)`);
  
  // 4. If over 80 characters, optimize by removing less important parts
  if (Buffer.byteLength(ebayTitle, 'utf8') > 80) {
    console.log(`Title too long (${ebayTitle.length} chars), optimizing...`);
    
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
    
    // If still too long, truncate the main title
    const baseStructure = `by ${authorName}`;
    const availableSpace = 80 - baseStructure.length - 1; // -1 for space
    
    if (availableSpace > 0) {
      const truncatedMainTitle = mainTitle.substring(0, availableSpace).trim();
      optimizedTitle = `${truncatedMainTitle} ${baseStructure}`;
      console.log(`Truncated main title, new length: ${optimizedTitle.length}`);
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
  
  // Step 3: Determine format (keyword generation removed)
  console.log('Step 3: Determining format...');
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
  
  // Step 4: Build title
  console.log('Step 4: Building title...');
  let ebayTitle = await buildEbayTitle({
    title: listingData.title,
    author: listingData.author,
    format,
    bookType,
    narrativeType
  });
  console.log('Built title:', ebayTitle);
  console.log('Title length:', ebayTitle.length);
  
  // Step 5: AI-powered intelligent truncation if needed
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