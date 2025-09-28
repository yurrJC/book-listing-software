/**
 * Valid eBay Genres for Australia
 * Extracted from server.js for reuse across the application
 */

const VALID_EBAY_GENRES = [
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

/**
 * Search genres by keyword
 * @param {string} keyword - Search term
 * @returns {string[]} - Matching genres
 */
function searchGenres(keyword) {
  if (!keyword || keyword.trim() === '') return VALID_EBAY_GENRES;
  
  const searchTerm = keyword.toLowerCase();
  return VALID_EBAY_GENRES.filter(genre => 
    genre.toLowerCase().includes(searchTerm)
  );
}

/**
 * Get genres that start with the given keyword
 * @param {string} keyword - Search term
 * @returns {string[]} - Matching genres
 */
function getGenresStartingWith(keyword) {
  if (!keyword || keyword.trim() === '') return [];
  
  const searchTerm = keyword.toLowerCase();
  return VALID_EBAY_GENRES.filter(genre => 
    genre.toLowerCase().startsWith(searchTerm)
  );
}

module.exports = {
  VALID_EBAY_GENRES,
  searchGenres,
  getGenresStartingWith
};
