// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const xml2js = require('xml2js');
const axios = require('axios');
const FormData = require('form-data'); // Used by uploadPhotosToEbay
const OpenAI = require('openai');
const crypto = require('crypto');

const isProduction = true; // Force production mode
console.log('Using production eBay environment:', isProduction);

// --- OpenAI Client Initialization ---
let openai;
try {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY environment variable is not set.");
    }
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
    console.log("OpenAI client initialized successfully.");
    console.log("OPENAI_API_KEY exists: Yes");
    console.log("OPENAI_API_KEY length:", process.env.OPENAI_API_KEY.length);
} catch (error) {
    console.error("!!! CRITICAL ERROR initializing OpenAI client !!!", error.message);
    // Decide if the app can run without OpenAI
    // process.exit(1); // Uncomment to exit if OpenAI is essential
}

// --- Constants and Definitions ---
const FLAW_DEFINITIONS = {
  'COVER_CREASING': { key: 'COVER_CREASING', label: 'Cover Creasing', description: 'Creasing to Cover - Book covers contain noticeable creasing from previous use' },
  'WAVY_PAGES': { key: 'WAVY_PAGES', label: 'Wavy Pages', description: 'Wavy Pages - Pages throughout the book contain a wavy effect due to the manufacturers printing process' },
  'DIRT_RESIDUE': { key: 'DIRT_RESIDUE', label: 'Dirt Residue', description: 'Dirt Residue - The book has noticeable dirt residue as pictured' },
  'INSCRIBED': { key: 'INSCRIBED', label: 'Inscribed (Owner Markings)', description: 'Inscribed - The book is inscribed with previous owners markings' },
  'NOTES': { key: 'NOTES', label: 'Notes/Highlighting', description: 'Inscriptions within - The book has either highlighter/pen/pencil inscriptions throughout the book' },
  'WATER_DAMAGE': { key: 'WATER_DAMAGE', label: 'Water Damage', description: 'Water Damage - Water damage to the pages of the book with readability still intact - as pictured' },
  'FOXING': { key: 'FOXING', label: 'Foxing', description: 'Foxing - Foxing effect noticeable to the book - as pictured' },
  'YELLOWING': { key: 'YELLOWING', label: 'Yellowing/Age Tanning', description: 'Yellowing Age - Book contains noticeable yellowing page to pages' },
  'BIND_ISSUE': { key: 'BIND_ISSUE', label: 'Binding Issue', description: 'Bind issue - Noticeable wear to the books binding with no loose or missing pages - as pictured' }
};

const EBAY_CONDITION_MAP = {
  'Brand New': '1000', 'Like New': '1500', 'Very Good': '3000', 'Good': '5000', 'Acceptable': '6000'
};

const DOWNGRADE_FLAW_KEYS = [
  'WATER_DAMAGE', 'BIND_ISSUE', 'DIRT_RESIDUE', 'FOXING', 'NOTES'
];
// --- End Constants ---

// --- Verbose Token Debugging ---
console.log("--- ENV VARS CHECK ---");
console.log("Auth Token exists:", process.env.EBAY_AUTH_TOKEN ? "Yes" : "No");
if (process.env.EBAY_AUTH_TOKEN) {
    console.log("Auth Token length:", process.env.EBAY_AUTH_TOKEN.length);
    console.log("Auth Token first 10 chars:", process.env.EBAY_AUTH_TOKEN.substring(0, 10));
    console.log("Auth Token last 10 chars:", process.env.EBAY_AUTH_TOKEN.substring(process.env.EBAY_AUTH_TOKEN.length - 10));
}
console.log("----------------------");

// --- Service Imports ---
const { processImageAndExtractISBN } = require('./azureVision');
const isbndbClient = require('./isbndbClient');

// --- Express App Setup ---
const app = express();

// CORS Middleware
app.use(cors({
  // IMPORTANT: Ensure your ACTUAL frontend URL is listed here, including http/https and port if needed for local dev
  origin: [
      'https://book-listing-software-1.onrender.com', // Deployed Frontend
      'http://localhost:3000', // Example Local Dev Frontend
      'https://api.ebay.com',
      'https://api.sandbox.ebay.com'
    ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploads Directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log(`Created uploads directory at: ${uploadsDir}`);
} else {
  console.log(`Uploads directory exists at: ${uploadsDir}`);
}

// Static Files Server
app.use('/uploads', express.static(uploadsDir));

// Multer Setup
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir); // Use the defined uploadsDir
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) { // Case-insensitive match
      return cb(new Error('Only image files (jpg, jpeg, png, gif) are allowed!'), false);
    }
    cb(null, true);
  }
});
// --- End Express App Setup ---


// --- Helper Functions ---

function isValidISBN(isbn) {
  if (!isbn || typeof isbn !== 'string') return null;
  const cleanIsbn = isbn.replace(/[- ]/g, '');
  if (cleanIsbn.length === 13 && (cleanIsbn.startsWith('978') || cleanIsbn.startsWith('979'))) return cleanIsbn;
  if (cleanIsbn.length === 10 && /^[\dX]+$/.test(cleanIsbn)) return cleanIsbn;
  return null;
}

async function fetchBookMetadata(isbn) {
  console.log(`Fetching metadata for ISBN: ${isbn}`);
  try {
    const bookData = await isbndbClient.getBookMetadata(isbn);
    if (bookData?.book) {
      const book = bookData.book;
      // Extract publication year from date_published if possible
      const publicationYear = book.date_published ? String(book.date_published).match(/\d{4}/)?.[0] : null;
      return {
        title: book.title || 'Unknown Title',
        author: book.authors ? book.authors.join(', ') : 'Unknown Author',
        publisher: book.publisher || 'Unknown Publisher',
        publishedDate: book.date_published || 'Unknown',
        publicationYear: publicationYear, // Add parsed year
        coverUrl: book.image || '',
        synopsis: book.synopsis || '',
        pages: book.pages,
        subjects: Array.isArray(book.subjects) ? book.subjects : [],
        language: book.language || 'English',
        binding: book.binding || 'Paperback', // Default binding
        format: book.binding || 'Paperback', // Add format for consistency
        edition: book.edition || null
      };
    } else {
      console.log(`No book data found for ISBN: ${isbn}`);
      return null; // Return null if not found
    }
  } catch (error) {
    console.error(`Error fetching book metadata for ISBN ${isbn}:`, error);
    return null; // Return null on error
  }
}

function numberToOrdinal(n) {
  if (isNaN(n)) return n; // Return original if not a number
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatEdition(edition) {
  if (!edition) return '';
  const edStr = String(edition).trim();
  if (edStr.toLowerCase().includes('edition')) return edStr;
  if (/^\d+$/.test(edStr)) return numberToOrdinal(parseInt(edStr, 10)) + ' Edition';
  return edStr;
}

async function determineBookTypeUsingGPT(listingData) {
  if (!openai) { console.warn("OpenAI client not initialized, skipping book type determination."); return "Book"; }
  if (!listingData?.title) { console.warn("Missing title, cannot determine book type."); return "Book"; }
  console.log(`Determining book type for: "${listingData.title}"`);
  try {
    // ... (keep existing GPT logic) ...
    const response = await openai.chat.completions.create({ /* ... */ });
    const bookType = response.choices[0].message.content.trim();
    if (["Cookbook", "Textbook", "Book"].includes(bookType)) {
      console.log(`AI classified as: ${bookType}`);
      return bookType;
    }
    console.log(`AI returned unexpected type: "${bookType}", defaulting to "Book"`);
    return "Book";
  } catch (error) {
    console.error('Error determining book type via GPT:', error);
    return "Book"; // Fallback
  }
}

async function generateOptimizedKeywordUsingGPT(listingData, bookType) {
    if (!openai) { console.warn("OpenAI client not initialized, skipping keyword generation."); return "General Interest"; }
    if (!listingData?.title) { console.warn("Missing title, cannot generate keyword."); return "General Interest"; }
    console.log(`Generating keyword for: "${listingData.title}"`);
    try {
        // ... (keep existing complex GPT logic for keyword generation) ...
        const response = await openai.chat.completions.create({ /* ... */ });
        let keyword = response.choices[0].message.content.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
        // ... (keep post-processing and truncation logic) ...
        console.log(`Generated keyword: "${keyword}"`);
        return keyword || "General Interest";
    } catch (error) {
        console.error('Error generating keyword via GPT:', error);
        return "General Interest"; // Fallback
    }
}

function extractEditionFromOCR(ocrText) {
  if (!ocrText || typeof ocrText !== 'string') return null;
  console.log("Searching for edition in OCR text...");
  const upperText = ocrText.toUpperCase();
  const directMatches = ["FIRST EDITION", "SECOND EDITION", /* ... */ "EIGHTH EDITION"];
  for (const match of directMatches) { if (upperText.includes(match)) { /* ... return formatted ... */ } }
  const editionPatterns = [ /* ... keep patterns ... */ ];
  for (const pattern of editionPatterns) { const match = upperText.match(pattern.regex); if (match) { /* ... return formatted ... */ } }
  console.log("No edition found in OCR text.");
  return null;
}

async function generateCompleteEbayTitle(listingData) {
  console.log(`Generating eBay title for: "${listingData?.title || 'N/A'}"`);
  try {
    let mainTitle = listingData.title || 'Book'; // Fallback
    let subtitle = '';
    if (mainTitle.includes(':')) { /* ... split title ... */ }
    let authorName = listingData.author || '';
    if (authorName) { /* ... process author name ... */ }
    let editionText = extractEditionFromOCR(listingData.ocrText || ''); // Use empty string if ocrText missing
    const authorSection = editionText ? `${authorName} ${editionText}`.trim() : authorName;
    const bookType = await determineBookTypeUsingGPT(listingData);
    const keyword = await generateOptimizedKeywordUsingGPT(listingData, bookType);
    let format = 'Paperback';
    const bindingInfo = listingData.format || listingData.binding || '';
    if (bindingInfo.toLowerCase().includes('hard')) format = 'Hardcover';
    // Build Title
    let title = subtitle ? `${mainTitle}: ${subtitle}` : mainTitle;
    title += authorSection ? ` by ${authorSection}` : '';
    title += ` ${format} ${bookType} ${keyword}`;
    title = title.replace(/\s+/g, ' ').trim(); // Clean extra spaces
    // Shorten if needed
    if (title.length > 80) {
        title = shortenTitle(title, mainTitle, authorSection, format, bookType, keyword);
    }
    console.log(`Final eBay title: "${title}" (${title.length})`);
    return title;
  } catch (error) {
    console.error('Error generating complete eBay title:', error);
    return `${listingData.title || 'Book'} by ${listingData.author || 'Author'}`.substring(0, 80); // Basic fallback
  }
}

function shortenTitle(fullTitle, mainTitle, author, format, bookType, keyword) {
    console.log('Shortening title...');
    // Keep the existing shortening logic, ensure it returns string within 80 chars
    // ... (existing logic) ...
    let shortenedTitle = fullTitle; // Start with full title
    // Step 1: Abbreviate format
    const abbrFormat = format === 'Hardcover' ? 'HC' : 'PB';
    shortenedTitle = shortenedTitle.replace(format, abbrFormat);
    // Step 2: Remove keyword if still too long
    if (shortenedTitle.length > 80) shortenedTitle = shortenedTitle.replace(` ${keyword}`, '').trim();
    // Step 3: Add keyword back if space allows, or partial keyword
    if (shortenedTitle.length + keyword.length + 1 <= 80) shortenedTitle += ` ${keyword}`;
    else if (shortenedTitle.length + keyword.split(' ')[0].length + 1 <= 80) shortenedTitle += ` ${keyword.split(' ')[0]}`;
    // Step 4: Remove book type if still too long
    if (shortenedTitle.length > 80) shortenedTitle = shortenedTitle.replace(` ${bookType}`, '').trim();
    // Step 5: Simplify to Title by Author + Format if still too long
    if (shortenedTitle.length > 80) shortenedTitle = `${mainTitle} by ${author} ${abbrFormat}`;
    // Final Trim
    return shortenedTitle.substring(0, 80).trim();
}

async function determineNarrativeTypeUsingGPT(listingData) {
    if (!openai) { console.warn("OpenAI client not initialized, defaulting narrative type."); return "Non-Fiction"; }
    if (!listingData?.title) { console.warn("Missing title, cannot determine narrative type."); return "Non-Fiction"; }
    console.log(`Determining narrative type for: "${listingData.title}"`);
    try {
        // ... (keep existing GPT logic) ...
        const response = await openai.chat.completions.create({ /* ... */ });
        const narrativeType = response.choices[0].message.content.trim();
        if (["Fiction", "Non-Fiction"].includes(narrativeType)) return narrativeType;
        return "Non-Fiction"; // Fallback
    } catch (error) {
        console.error('Error determining narrative type via GPT:', error);
        return "Non-Fiction"; // Fallback
    }
}

function formatLanguage(lang) {
  if (!lang || typeof lang !== 'string') return "English";
  const lower = lang.toLowerCase();
  if (lower === "en" || lower === "english") return "English";
  return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
}

function deleteUploadedImages(imageFiles) {
  if (!Array.isArray(imageFiles)) {
    console.log('Cannot delete images: Input is not an array.');
    return;
  }
  console.log(`Attempting to delete ${imageFiles.length} uploaded image files.`);
  imageFiles.forEach((file, index) => {
    if (!file || (typeof file !== 'object')) {
        console.warn(`Skipping invalid file entry at index ${index} during deletion.`);
        return;
    }
    const filePath = file.path || (file.filename ? path.join(uploadsDir, file.filename) : null); // Use uploadsDir directly
    if (!filePath) {
        console.warn(`Skipping file object at index ${index} due to missing path/filename. File:`, file);
        return;
    }
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted temp image file: ${filePath}`);
      } else {
        // This might happen normally if cleanup already occurred or file never wrote
        console.log(`Temp file not found, skipping delete: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
    }
  });
}

function generateBookDescription(bookData, selectedFlawKeys = []) {
  if (!bookData) return '<p>Error generating description: Missing book data.</p>';
  const displayTitle = bookData.ebayTitle || bookData.title || 'Book Listing';
  const isbnText = bookData.isbn || 'Not Provided';
  let flawsDescriptionHtml = '';
  if (Array.isArray(selectedFlawKeys) && selectedFlawKeys.length > 0) {
    flawsDescriptionHtml = selectedFlawKeys
      .map(key => FLAW_DEFINITIONS[key]?.description)
      .filter(Boolean)
      .map(line => `<p>${line}</p>`)
      .join('');
  }
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h1 style="color: #0053a0;">${displayTitle}</h1>
      <p><strong>ISBN:</strong> ${isbnText}</p>
      <h2>Product Condition:</h2>
      ${flawsDescriptionHtml || '<p>Please refer to photos for general condition.</p>'}
      <p>Please be aware that this book is in pre-owned, and used condition.</p>
      <p>Inscriptions on the inside cover of the book are always pictured.</p>
      <p>If a book has further pen or pencil underlines, highlights, tears, or flaws a sample page will be shown with a picture reference; however, it is not possible to show every page of the book where these may be apparent.</p>
      <p>All pre-owned books have been cleaned to the best of our ability before listing.</p>
      <p>Please refer to the attached product photos as the product listed is what you will receive.</p>
      <h2>Postage Policy:</h2>
      <p>This item will be sent under the specified postage option stated within the allocated handling time.</p>
      <p>Please double check your delivery address before payment.</p>
      <p>International orders are welcomed; however, any applicable customs duties are the responsibility of the buyer.</p>
      <h2>Feedback:</h2>
      <p>We make every effort to provide an accurate description of the product listed.</p>
      <p><strong>If there are any issues regarding your order, please contact us as soon as possible for a complete resolution before leaving feedback.</strong></p>
    </div>
  `;
}

async function determineBookTopicsUsingGPT(listingData) {
    if (!openai) { console.warn("OpenAI client not initialized, skipping topics."); return ["Books"]; }
    if (!listingData?.title) { console.warn("Missing title, cannot determine topics."); return ["Books"]; }
    console.log(`Determining topics for: "${listingData.title}"`);
    try {
        // ... (keep existing complex GPT logic for topics) ...
        const response = await openai.chat.completions.create({ /* ... */ });
        const responseJson = JSON.parse(response.choices[0].message.content);
        let topics = responseJson.topics || [];
        if (!topics.includes("Books")) topics.unshift("Books");
        console.log(`Determined Topics:`, topics);
        return topics;
    } catch (error) {
        console.error('Error determining topics via GPT:', error);
        return ["Books"]; // Fallback
    }
}

async function determineBookGenresUsingGPT(listingData) {
    if (!openai) { console.warn("OpenAI client not initialized, skipping genres."); return [listingData.narrativeType === "Fiction" ? "Fiction" : "Non-Fiction"]; }
    if (!listingData?.title) { console.warn("Missing title, cannot determine genres."); return [listingData.narrativeType === "Fiction" ? "Fiction" : "Non-Fiction"]; }
    console.log(`Determining genres for: "${listingData.title}"`);
    try {
        // ... (keep existing complex GPT logic for genres) ...
        const response = await openai.chat.completions.create({ /* ... */ });
        const responseJson = JSON.parse(response.choices[0].message.content);
        let genres = responseJson.genres || [];
        if (genres.length === 0) genres.push(listingData.narrativeType === "Fiction" ? "Fiction" : "Non-Fiction");
        console.log(`Determined Genres:`, genres);
        return genres;
    } catch (error) {
        console.error('Error determining genres via GPT:', error);
        return [listingData.narrativeType === "Fiction" ? "Fiction" : "Non-Fiction"]; // Fallback
    }
}

async function uploadPhotosToEbay(imageFiles) {
  if (!Array.isArray(imageFiles) || imageFiles.length === 0) {
    console.error("uploadPhotosToEbay called with invalid or empty imageFiles array.");
    return []; // Return empty array if no valid input
  }
  console.log(`Uploading ${imageFiles.length} photos to eBay EPS...`);
  const devId = process.env.EBAY_DEV_ID;
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const authToken = process.env.EBAY_AUTH_TOKEN;
  const apiEndpoint = isProduction ? 'https://api.ebay.com/ws/api.dll' : 'https://api.sandbox.ebay.com/ws/api.dll';
  const uploadedImages = [];

  for (const file of imageFiles) {
    // Basic check on file object structure
    if (!file || !file.path || !file.filename || !file.mimetype) {
        console.warn("Skipping invalid file object during eBay upload:", file);
        continue; // Skip this file
    }
    console.log(`Processing file for eBay upload: ${file.filename} (${file.path})`);
    try {
      const builder = new xml2js.Builder({ /* ... */ });
      const requestObj = { /* ... */ }; // Keep requestObj definition
      requestObj.RequesterCredentials.eBayAuthToken = authToken; // Ensure token is passed
      requestObj.PictureName = file.filename;
      const xmlMetadata = builder.buildObject(requestObj);
      const imageBuffer = fs.readFileSync(file.path); // Read file from its temp path
      const formData = new FormData();
      formData.append('XML Payload', xmlMetadata, { contentType: 'text/xml' });
      formData.append('image', imageBuffer, { filename: file.filename, contentType: file.mimetype });

      console.log(`Uploading ${file.filename} to ${apiEndpoint}`);
      const response = await axios({
        method: 'post', url: apiEndpoint,
        headers: {
            'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
            'X-EBAY-API-APP-NAME': appId, 'X-EBAY-API-DEV-NAME': devId,
            'X-EBAY-API-CERT-NAME': certId, 'X-EBAY-API-SITEID': '15',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
            ...formData.getHeaders()
        },
        data: formData, maxContentLength: Infinity, maxBodyLength: Infinity
      });

      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);

      if (result?.UploadSiteHostedPicturesResponse?.Ack === 'Success' || result?.UploadSiteHostedPicturesResponse?.Ack === 'Warning') {
        const pictureUrl = result.UploadSiteHostedPicturesResponse.SiteHostedPictureDetails?.FullURL;
        if (pictureUrl) {
            uploadedImages.push({ originalFile: file.filename, epsUrl: pictureUrl });
            console.log(`Success: ${file.filename} -> ${pictureUrl}`);
        } else {
            console.warn(`eBay upload success/warning for ${file.filename}, but no URL found in response:`, result);
        }
      } else {
        console.error(`eBay Picture Upload Error for ${file.filename}:`, result?.UploadSiteHostedPicturesResponse?.Errors || 'Unknown eBay error structure');
      }
    } catch (error) {
      console.error(`Failed to upload image ${file.filename} to eBay:`, error.message);
      if (error.response) console.error("Axios Error details:", error.response.data);
      // Optionally decide whether to continue or throw based on one failure
      // throw error; // Uncomment to stop process if one image fails
    }
  }
  console.log(`Finished eBay uploads. ${uploadedImages.length} of ${imageFiles.length} successful.`);
  return uploadedImages;
}

// --- End Helper Functions ---


// --- Core Business Logic Function ---

async function createEbayDraftListing(listingData) {
  const imageFileObjects = listingData?.imageFiles || []; // Ensure it's an array or empty
  let successful = false;
  const imagesToDelete = Array.isArray(imageFileObjects) ? imageFileObjects.filter(f => f && typeof f === 'object') : [];

  try {
    const { selectedCondition = 'Good', selectedFlawKeys = [] } = listingData;
    console.log(`--- Starting createEbayDraftListing for: ${listingData?.title || 'N/A'} ---`);

    // 1. Upload Photos
    if (!Array.isArray(imageFileObjects) || imageFileObjects.length === 0) {
      return { success: false, error: "No valid image files provided to create listing." };
    }
    const uploadedImages = await uploadPhotosToEbay(imageFileObjects);
    if (uploadedImages.length === 0) {
      return { success: false, error: "Failed to upload any images to eBay EPS." };
    }
    const epsImageUrls = uploadedImages.map(img => img.epsUrl);

    // 2. Determine Categories & Title
    const narrativeType = await determineNarrativeTypeUsingGPT(listingData);
    listingData.narrativeType = narrativeType; // Store for metadata return
    const bookTopics = await determineBookTopicsUsingGPT(listingData);
    const bookGenres = await determineBookGenresUsingGPT(listingData);
    let ebayTitle = listingData.customTitle || listingData.ebayTitle;
    if (!ebayTitle) {
      ebayTitle = await generateCompleteEbayTitle({ ...listingData, ocrText: listingData.ocrText || '' });
    }
    listingData.ebayTitle = ebayTitle; // Ensure updated title is on listingData

    // 3. Prepare eBay Request Data
    const conditionID = EBAY_CONDITION_MAP[selectedCondition] || EBAY_CONDITION_MAP['Good'];
    const itemDescription = generateBookDescription(listingData, selectedFlawKeys);

    // Build ItemSpecifics NameValueList
    const nameValueList = [
        { 'Name': 'Format', 'Value': listingData.format || 'Paperback' },
        { 'Name': 'Author', 'Value': listingData.author || 'Unknown' },
        { 'Name': 'ISBN', 'Value': listingData.isbn || 'N/A' },
        { 'Name': 'Book Title', 'Value': (listingData.title || 'N/A').substring(0, 65) }
    ];
    if (listingData.sku && String(listingData.sku).trim()) nameValueList.push({ 'Name': 'SKU', 'Value': String(listingData.sku).trim() });
    if (narrativeType) nameValueList.push({ 'Name': 'Narrative Type', 'Value': narrativeType });
    if (Array.isArray(bookTopics)) bookTopics.forEach(t => nameValueList.push({ 'Name': 'Topic', 'Value': t }));
    if (Array.isArray(bookGenres)) bookGenres.forEach(g => nameValueList.push({ 'Name': 'Genre', 'Value': g }));
    if (listingData.publisher && listingData.publisher !== 'Unknown') nameValueList.push({ 'Name': 'Publisher', 'Value': listingData.publisher });
    nameValueList.push({ 'Name': 'Language', 'Value': formatLanguage(listingData.language) });
    if (listingData.publicationYear) nameValueList.push({ 'Name': 'Publication Year', 'Value': listingData.publicationYear });

    // Build Full Request Object
    const requestObj = {
      '$': { xmlns: 'urn:ebay:apis:eBLBaseComponents' },
      'RequesterCredentials': { 'eBayAuthToken': process.env.EBAY_AUTH_TOKEN },
      'ErrorLanguage': 'en_AU', 'WarningLevel': 'High',
      'Item': {
        'Title': ebayTitle, 'Description': itemDescription,
        'PrimaryCategory': { 'CategoryID': '261186' },
        'StartPrice': listingData.price || '9.99', 'ConditionID': conditionID,
        'ConditionDescription': `Condition is ${selectedCondition}. See description/photos.`,
        'Country': 'AU', 'Currency': 'AUD', 'DispatchTimeMax': '3',
        'ListingDuration': 'GTC', 'ListingType': 'FixedPriceItem',
        'BestOfferDetails': { 'BestOfferEnabled': 'true' },
        'Location': process.env.SELLER_LOCATION || 'Ascot Vale, VIC',
        'PictureDetails': { 'PictureSource': 'EPS', 'GalleryType': 'Gallery', 'PictureURL': epsImageUrls },
        'PostalCode': process.env.SELLER_POSTAL_CODE, 'Quantity': '1',
        'ItemSpecifics': { 'NameValueList': nameValueList },
        'ProductListingDetails': { 'ISBN': listingData.isbn, 'IncludePrefilledItemInformation': 'true', 'UseStockPhotoURLAsGallery': 'false' }
      }
    };
    if (typeof listingData.sku === 'string' && listingData.sku.trim()) requestObj.Item.SKU = listingData.sku.trim();
    // Add Policies
    const shippingPolicyId = process.env.EBAY_SHIPPING_POLICY_ID; /* ... */
    if (isProduction && shippingPolicyId /* && others */) { /* ... SellerProfiles ... */ }
    else { /* ... explicit Shipping/Return ... */ }

    // 4. Build XML & Call eBay AddItem API
    const builder = new xml2js.Builder();
    const xml = builder.buildObject(requestObj);
    console.log('Sending AddItem request to eBay...');
    const apiEndpoint = isProduction ? 'https://api.ebay.com/ws/api.dll' : 'https://api.sandbox.ebay.com/ws/api.dll';
    const response = await axios({ method: 'post', url: apiEndpoint, headers: { /* ... */ 'Content-Type': 'text/xml' }, data: xml });

    // 5. Process Response
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    console.log('Parsed eBay AddItem Response:', JSON.stringify(result, null, 2));

    // 6. Handle Success/Failure & Cleanup
    if (result?.AddItemResponse?.Ack === 'Success' || result?.AddItemResponse?.Ack === 'Warning') {
      successful = true; // Mark success before deleting
      console.log(`AddItem successful (Ack: ${result.AddItemResponse.Ack}). Deleting temporary files...`);
      deleteUploadedImages(imagesToDelete); // Delete the temp files

      return {
        success: true,
        listingId: result.AddItemResponse.ItemID,
        ebayUrl: `https://www.ebay.com.au/itm/${result.AddItemResponse.ItemID}`,
        status: 'ACTIVE', isbn: listingData.isbn, sku: listingData.sku,
        metadata: {
          title: listingData.title, author: listingData.author, publisher: listingData.publisher,
          ebayTitle: ebayTitle, topics: bookTopics, genres: bookGenres, narrativeType: narrativeType
        },
        processedImage: uploadedImages.length > 0 ? uploadedImages[0].originalFile : null
      };
    } else {
      console.error('eBay API Error in AddItem:', result?.AddItemResponse?.Errors || 'Unknown AddItem error structure');
      return { success: false, errors: result?.AddItemResponse?.Errors || { ShortMessage: 'Unknown eBay AddItem failure.' } };
    }

  } catch (error) {
    console.error('!!! Error within createEbayDraftListing function !!!');
    console.error('Error Message:', error.message);
    if (error.response) console.error("Axios Error Response:", error.response.data);
    else console.error('Error Stack:', error.stack);

    // Attempt to parse XML error from Axios if available
    let ebayErrors = null;
    if (error.response?.data) {
      try {
        const parser = new xml2js.Parser({ explicitArray: false });
        const errorResult = await parser.parseStringPromise(error.response.data);
        if (errorResult?.AddItemResponse?.Errors) ebayErrors = errorResult.AddItemResponse.Errors;
      } catch (parseError) { /* Ignore */ }
    }

    return {
      success: false,
      error: error.message || 'An unexpected error occurred during listing creation.',
      errors: ebayErrors // Include parsed eBay errors if found
    };
  }
  // No finally block needed, deletion happens only on explicit success path
}
// --- End Core Business Logic Function ---


// --- API Routes ---

// Root Route
app.get('/', (req, res) => {
  res.send('Book Listing API is Alive!');
});

// Initial Processing Route
app.post('/api/processBook', upload.fields([{ name: 'mainImages', maxCount: 24 }]), async (req, res) => {
  console.log('\n--- Received /api/processBook Request ---');
  console.log('Body:', req.body);
  console.log('Files:', req.files?.mainImages?.length || 0);

  try {
    const mainImages = req.files?.mainImages || [];
    if (mainImages.length === 0) return res.status(400).json({ success: false, error: 'No main images uploaded' });

    const initialSelectedCondition = req.body.selectedCondition || 'Good';
    let selectedFlawKeys = [];
    try {
        if(req.body.selectedFlaws) selectedFlawKeys = JSON.parse(req.body.selectedFlaws);
        if (!Array.isArray(selectedFlawKeys)) selectedFlawKeys = [];
    } catch (e) { return res.status(400).json({ success: false, error: 'Invalid selectedFlaws format' }); }

    const manualIsbn = req.body.manualIsbn ? req.body.manualIsbn.trim() : null;
    const mainImageFilename = mainImages[0].filename; // Assuming at least one image due to check above

    let isbn = null;
    let allOcrText = '';

    // ISBN & OCR Extraction
    if (manualIsbn && isValidISBN(manualIsbn)) {
      isbn = isValidISBN(manualIsbn);
      console.log(`Using manual ISBN: ${isbn}`);
    } else {
      console.log('Attempting OCR for ISBN...');
      for (let i = 0; i < Math.min(mainImages.length, 3); i++) {
        const file = mainImages[i];
        const result = await processImageAndExtractISBN(file.path);
        if (result) {
          if (!isbn && result.isbn) { // Found ISBN
            isbn = result.isbn;
            console.log(`ISBN found via OCR in ${file.filename}: ${isbn}`);
          }
          if (result.ocrText) allOcrText += result.ocrText + ' '; // Collect all OCR text
        }
        if (isbn) break; // Stop image processing if ISBN found
      }
    }
    // Collect OCR text even if manual ISBN was used, for edition check
    if (!allOcrText && mainImages.length > 0) {
       console.log('Collecting OCR text (manual ISBN or no ISBN found yet)...');
       for (let i = 0; i < Math.min(mainImages.length, 3); i++) {
            const result = await processImageAndExtractISBN(mainImages[i].path);
            if (result?.ocrText) allOcrText += result.ocrText + ' ';
       }
    }

    if (!isbn) {
      console.error('Failed to find/validate ISBN.');
      deleteUploadedImages(mainImages);
      return res.status(400).json({ success: false, error: 'No valid ISBN found or provided.' });
    }

    // Fetch Metadata
    const metadata = await fetchBookMetadata(isbn);
    if (!metadata) {
      console.error(`Could not fetch metadata for ISBN: ${isbn}`);
      deleteUploadedImages(mainImages);
      // Send 404 might be better, but keep 400 for consistency if needed
      return res.status(404).json({ success: false, error: 'Could not retrieve book information for this ISBN.' });
    }

    // Determine Final Condition
    let finalBookCondition = initialSelectedCondition;
    if (!EBAY_CONDITION_MAP[finalBookCondition]) finalBookCondition = 'Good'; // Sanitize initial
    let conditionDowngraded = false;
    for (const flawKey of selectedFlawKeys) {
      if (DOWNGRADE_FLAW_KEYS.includes(flawKey)) {
        finalBookCondition = 'Acceptable';
        conditionDowngraded = true;
        break;
      }
    }

    // Generate eBay Title
    const ebayTitle = await generateCompleteEbayTitle({ ...metadata, ocrText });

    // Prepare Response (only send necessary info, not full file paths)
    const responseData = {
      success: true,
      isbn,
      metadata, // Contains title, author, publisher, format etc.
      ebayTitle,
      // Send back info about the images for the next step, NOT sensitive paths
      allImages: mainImages.map(f => ({ filename: f.filename, mimetype: f.mimetype })),
      mainImage: mainImageFilename, // Just the filename of the first image
      selectedFlawKeys,
      condition: finalBookCondition,
      conditionDowngraded,
      ocrText: allOcrText.substring(0, 2000), // Send back limited OCR text if useful
    };

    console.log('--- Sending /api/processBook Response ---');
    res.json(responseData);

  } catch (error) {
    console.error('Error processing book in /api/processBook:', error);
    // Attempt cleanup on error
    if (req.files?.mainImages) deleteUploadedImages(req.files.mainImages);
    res.status(500).json({ success: false, error: 'Processing failed: ' + error.message });
  }
});


// Listing Creation Route (Handles FormData)
app.post('/api/createListing', upload.fields([{ name: 'imageFiles', maxCount: 24 }]), async (req, res) => {
  console.log('\n--- Received /api/createListing Request ---');
  console.log('Body Keys:', Object.keys(req.body));
  console.log('Files received:', req.files?.imageFiles?.length || 0);

  try {
    const imageFileObjects = req.files?.imageFiles || [];
    const {
        isbn, price, sku, customTitle, selectedCondition, ocrText,
        title, author, publisher, publicationYear, synopsis, language,
        format, subjects, ebayTitle // Receive all metadata fields back
    } = req.body;

    let selectedFlawKeys = [];
     try {
        if(req.body.selectedFlawKeys) selectedFlawKeys = JSON.parse(req.body.selectedFlawKeys);
        if (!Array.isArray(selectedFlawKeys)) selectedFlawKeys = [];
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

    // --- Prepare listingData for the core logic function ---
    const listingData = {
      // Core data
      isbn, price, sku: sku || '', customTitle, selectedCondition, selectedFlawKeys, ocrText,
      // Image file objects from this request's upload
      imageFiles: imageFileObjects,
      // Metadata fields passed back from frontend
      title: title || '', author: author || '', publisher: publisher || '', publicationYear,
      synopsis: synopsis || '', language: language || '', format: format || '',
      subjects: subjects ? JSON.parse(subjects) : [], // Parse subjects if sent as JSON string
      ebayTitle // Generated title passed back
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
         // Extract specific eBay error message if available
         if (listingResponse?.errors) {
             const ebayError = Array.isArray(listingResponse.errors) ? listingResponse.errors[0] : listingResponse.errors;
             if (ebayError?.SeverityCode === 'Error') statusCode = 400;
             errorMessage = ebayError?.LongMessage || ebayError?.ShortMessage || errorMessage;
         }
         // IMPORTANT: Do NOT delete images here if listing failed (deletion is handled inside createEbayDraftListing on its success)
         return res.status(statusCode).json({
             success: false,
             error: errorMessage,
             details: listingResponse?.errors
         });
    } else {
      // SUCCESS: listingResponse contains success:true
      console.log('Sending success response from /api/createListing');
      // Image deletion happens inside createEbayDraftListing upon its success
      res.json({ // Send the full success response back
        success: true,
        ...listingResponse // Spread the success data (listingId, url, metadata, etc.)
      });
    }

  } catch (error) { // Catch errors *within this handler* (e.g., parsing, validation)
    console.error('!!! Unexpected error in /api/createListing endpoint handler !!!');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('Error Object:', error); // Log the raw error object

    // Attempt cleanup of files uploaded *in this specific request*
    if (req.files?.imageFiles && Array.isArray(req.files.imageFiles)) {
        console.log(`Attempting cleanup of ${req.files.imageFiles.length} file(s) after handler error...`);
        deleteUploadedImages(req.files.imageFiles);
    } else {
        console.log('No req.files found to clean up after handler error.');
    }

    res.status(500).json({
        success: false,
        error: `An unexpected server error occurred: ${error.message || 'Unknown error'}`
    });
  }
});
// --- End API Routes ---


// --- Server Listen ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads directory configured at: ${uploadsDir}`);
  console.log(`Static files served from /uploads`);
});
// --- End Server Listen ---