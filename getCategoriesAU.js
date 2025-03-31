const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
require('dotenv').config();

// Get eBay credentials from environment variables
const devId = process.env.EBAY_DEV_ID;
const appId = process.env.EBAY_APP_ID;
const certId = process.env.EBAY_CERT_ID;
const authToken = process.env.EBAY_AUTH_TOKEN;

// Build the GetCategories request XML
const builder = new xml2js.Builder({
  rootName: 'GetCategoriesRequest',
  xmldec: { version: '1.0', encoding: 'UTF-8' },
  renderOpts: { pretty: true, indent: '  ', newline: '\n' },
  headless: false
});

const requestObj = {
  '$': { xmlns: 'urn:ebay:apis:eBLBaseComponents' },
  'RequesterCredentials': {
    'eBayAuthToken': authToken
  },
  'CategorySiteID': '15', // 15 is Australia
  'DetailLevel': 'ReturnAll',
  'LevelLimit': '4', // Limit to 4 levels deep to keep response manageable
  'ViewAllNodes': 'true' // Get all nodes, including non-leaf categories
};

const xmlPayload = builder.buildObject(requestObj);

// Make the GetCategories API request
async function getCategories() {
  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.sandbox.ebay.com/ws/api.dll',
      headers: {
        'X-EBAY-API-CALL-NAME': 'GetCategories',
        'X-EBAY-API-APP-NAME': appId,
        'X-EBAY-API-DEV-NAME': devId,
        'X-EBAY-API-CERT-NAME': certId,
        'X-EBAY-API-SITEID': '15', // Australia
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
        'Content-Type': 'text/xml'
      },
      data: xmlPayload
    });

    // Parse the XML response
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);

    // Save the result to a file for easier analysis
    fs.writeFileSync('ebay_categories_au.json', JSON.stringify(result, null, 2));
    
    // Process book categories for easier reference
    const categories = result.GetCategoriesResponse.CategoryArray.Category;
    const bookCategories = findBookCategories(categories);
    
    // Save only book categories to a separate file
    fs.writeFileSync('ebay_book_categories_au.json', JSON.stringify(bookCategories, null, 2));
    
    console.log('Categories retrieved and saved to ebay_categories_au.json');
    console.log('Book categories saved to ebay_book_categories_au.json');
    
    return result;
  } catch (error) {
    console.error('Error getting eBay categories:', error);
    throw error;
  }
}

// Helper function to find and filter book categories
function findBookCategories(categories) {
  // Find the main Books category first
  const booksCategory = categories.find(category => 
    category.CategoryName === 'Books' || 
    category.CategoryName === 'Books, Comics & Magazines'
  );
  
  if (!booksCategory) return [];
  
  const booksCategoryId = booksCategory.CategoryID;
  
  // Filter all categories that are children of the main Books category
  const bookCategories = categories.filter(category => {
    // Check if this category is a direct child or descendant of the Books category
    let current = category;
    while (current && current.CategoryParentID) {
      if (current.CategoryParentID === booksCategoryId) {
        return true;
      }
      // Find the parent category
      current = categories.find(c => c.CategoryID === current.CategoryParentID);
    }
    return false;
  });
  
  // Add the main Books category
  bookCategories.unshift(booksCategory);
  
  // Format the results for easier reading
  return bookCategories.map(category => ({
    id: category.CategoryID,
    name: category.CategoryName,
    parentId: category.CategoryParentID,
    level: category.CategoryLevel,
    isLeaf: category.LeafCategory === 'true'
  }));
}

// Run the function
getCategories().catch(console.error);