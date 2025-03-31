const fs = require('fs');

// Load the full category file
const allCategories = JSON.parse(fs.readFileSync('ebay_categories_au.json', 'utf8'));
const categories = allCategories.GetCategoriesResponse.CategoryArray.Category;

// Function to extract book categories
function findBookCategories(categories) {
  // Convert to array if it's not already
  const categoriesArray = Array.isArray(categories) ? categories : [categories];
  
  // Find the main Books category
  const booksCategory = categoriesArray.find(category => 
    (category.CategoryName && category.CategoryName.includes('Books')) || 
    (category.CategoryName && category.CategoryName.includes('books'))
  );
  
  if (!booksCategory) {
    console.log('No main Books category found');
    return [];
  }
  
  console.log(`Found main Books category: ${booksCategory.CategoryName} (ID: ${booksCategory.CategoryID})`);
  
  const booksCategoryId = booksCategory.CategoryID;
  
  // Get all book-related categories (direct children of the Books category or with "book" in name)
  const bookCategories = categoriesArray.filter(category => {
    return (category.CategoryParentID === booksCategoryId) || 
           (category.CategoryName && category.CategoryName.toLowerCase().includes('book'));
  });
  
  console.log(`Found ${bookCategories.length} book-related categories`);
  
  // Format the results for easier reading
  return bookCategories.map(category => ({
    id: category.CategoryID,
    name: category.CategoryName,
    parentId: category.CategoryParentID,
    level: category.CategoryLevel,
    isLeaf: category.LeafCategory === 'true'
  }));
}

// Extract book categories
const bookCategories = findBookCategories(categories);

// Filter for leaf categories only (where you can actually list items)
const leafBookCategories = bookCategories.filter(cat => cat.isLeaf);

// Save the results
fs.writeFileSync('ebay_book_categories_au.json', JSON.stringify(bookCategories, null, 2));
fs.writeFileSync('ebay_book_leaf_categories_au.json', JSON.stringify(leafBookCategories, null, 2));

console.log(`Saved ${bookCategories.length} book categories to ebay_book_categories_au.json`);
console.log(`Saved ${leafBookCategories.length} leaf book categories to ebay_book_leaf_categories_au.json`);