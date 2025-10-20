# Store Categories Configuration

This feature automatically assigns Store Categories (Category 1 and Category 2) to your eBay listings to help with organization and multi-order opportunities.

## How It Works

1. **Category 1**: Typically used for date-based tracking (e.g., "October 2025")
2. **Category 2**: Typically used for genre-based organization (e.g., "Fiction", "Cooking & Food")

The system can automatically assign Category 2 based on the book's content analysis.

## Configuration

Add these environment variables to your `.env` file:

```bash
# Default Store Categories (applied to all listings)
EBAY_STORE_CATEGORY_1=October 2025
EBAY_STORE_CATEGORY_2=Fiction

# Automatic Category Assignment (Category 2 based on book content)
EBAY_STORE_CATEGORY_FICTION=123456
EBAY_STORE_CATEGORY_NON_FICTION=123457
EBAY_STORE_CATEGORY_COOKBOOK=123458
EBAY_STORE_CATEGORY_TEXTBOOK=123459
EBAY_STORE_CATEGORY_BIOGRAPHY=123460
EBAY_STORE_CATEGORY_HISTORY=123461
EBAY_STORE_CATEGORY_SCIENCE=123462
EBAY_STORE_CATEGORY_ART=123463
EBAY_STORE_CATEGORY_PSYCHOLOGY=123464
EBAY_STORE_CATEGORY_BUSINESS=123465
```

## Finding Your Store Category IDs

1. Go to your eBay Store Manager
2. Navigate to Store Categories
3. The IDs are shown in the URL or can be found in the Store Categories section
4. Replace the example IDs (123456, etc.) with your actual eBay Store Category IDs

## Usage

1. Click the "⚙️ Store Categories" button in the top-right corner of the application
2. Configure your default categories and automatic assignment mappings
3. The system will automatically apply these categories when creating listings

## Automatic Assignment Logic

The system determines Category 2 based on:
1. **Book Genres** (highest priority)
2. **Book Topics** (second priority)  
3. **Narrative Type** (Fiction/Non-Fiction fallback)

If no automatic assignment is found, it will use the default Category 2 if configured.
