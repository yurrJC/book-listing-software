// Test to demonstrate the improved Fiction title logic

function testImprovedFictionLogic() {
  console.log('Testing improved Fiction title logic...\n');
  
  // Test the exact scenario you mentioned
  const testCase = {
    title: 'The Silent Patient',
    author: 'Alex Michaelides',
    format: 'Hardcover',
    bookType: 'Book',
    keyword: 'Psychological Thriller'
  };
  
  console.log('=== TEST CASE 1: Your Example ===');
  let title = `${testCase.title} by ${testCase.author} ${testCase.format} ${testCase.bookType} ${testCase.keyword}`;
  console.log('Original title:', title);
  console.log('Length:', title.length);
  
  // Apply the improved Fiction logic
  const titleWithFiction = `${title} Fiction`;
  console.log('With "Fiction" added:', titleWithFiction);
  console.log('Length with Fiction:', titleWithFiction.length);
  
  if (titleWithFiction.length > 80) {
    console.log('❌ Exceeds 80 chars, applying improved logic...');
    
    // Remove the keyword
    const titleWithoutKeyword = title.replace(` ${testCase.keyword}`, '');
    console.log('Title without keyword:', titleWithoutKeyword);
    console.log('Length without keyword:', titleWithoutKeyword.length);
    
    // Check if we can preserve part of the compound keyword
    const keywordWords = testCase.keyword.split(' ');
    console.log('Keyword words:', keywordWords);
    
    if (keywordWords.length > 1) {
      // Try to keep the first word of the compound keyword
      const firstWord = keywordWords[0];
      const titleWithFirstWord = `${titleWithoutKeyword} ${firstWord} Fiction`;
      console.log('With first word + Fiction:', titleWithFirstWord);
      console.log('Length with first word + Fiction:', titleWithFirstWord.length);
      
      if (titleWithFirstWord.length <= 80) {
        console.log('✅ SUCCESS: Preserved first word of keyword');
        console.log('Final title:', titleWithFirstWord);
      } else {
        // If even the first word doesn't fit, just use "Fiction"
        const titleWithJustFiction = `${titleWithoutKeyword} Fiction`;
        console.log('❌ First word too long, using just "Fiction"');
        console.log('Final title:', titleWithJustFiction);
      }
    } else {
      // Single word keyword, just replace with "Fiction"
      const titleWithJustFiction = `${titleWithoutKeyword} Fiction`;
      console.log('Single word keyword, using just "Fiction"');
      console.log('Final title:', titleWithJustFiction);
    }
  } else {
    console.log('✅ SUCCESS: Both keywords + Fiction fit within 80 chars');
    console.log('Final title:', titleWithFiction);
  }
  
  console.log('\n=== TEST CASE 2: Single Word Keyword ===');
  const testCase2 = {
    title: 'The Silent Patient',
    author: 'Alex Michaelides',
    format: 'Hardcover',
    bookType: 'Book',
    keyword: 'Thriller'
  };
  
  let title2 = `${testCase2.title} by ${testCase2.author} ${testCase2.format} ${testCase2.bookType} ${testCase2.keyword}`;
  const titleWithFiction2 = `${title2} Fiction`;
  console.log('Original title:', title2);
  console.log('Length:', title2.length);
  console.log('With "Fiction" added:', titleWithFiction2);
  console.log('Length with Fiction:', titleWithFiction2.length);
  
  if (titleWithFiction2.length <= 80) {
    console.log('✅ SUCCESS: Single word keyword + Fiction fits');
    console.log('Final title:', titleWithFiction2);
  } else {
    console.log('❌ Would exceed 80 chars, would replace with just "Fiction"');
  }
  
  console.log('\n=== TEST CASE 3: Very Long Title ===');
  const testCase3 = {
    title: 'The Very Long Book Title That Would Make The Title Exceed Eighty Characters',
    author: 'Very Long Author Name',
    format: 'Hardcover',
    bookType: 'Book',
    keyword: 'Psychological Thriller'
  };
  
  let title3 = `${testCase3.title} by ${testCase3.author} ${testCase3.format} ${testCase3.bookType} ${testCase3.keyword}`;
  console.log('Original title:', title3);
  console.log('Length:', title3.length);
  
  const titleWithoutKeyword3 = title3.replace(` ${testCase3.keyword}`, '');
  const titleWithFirstWord3 = `${titleWithoutKeyword3} Psychological Fiction`;
  console.log('With first word + Fiction:', titleWithFirstWord3);
  console.log('Length with first word + Fiction:', titleWithFirstWord3.length);
  
  if (titleWithFirstWord3.length > 80) {
    console.log('❌ Even first word too long, would use just "Fiction"');
    const titleWithJustFiction3 = `${titleWithoutKeyword3} Fiction`;
    console.log('Final title:', titleWithJustFiction3);
  } else {
    console.log('✅ SUCCESS: Preserved first word even with long title');
    console.log('Final title:', titleWithFirstWord3);
  }
  
  console.log('\n=== COMPARISON ===');
  console.log('Old logic would have produced: "The Silent Patient by Alex Michaelides Hardcover Book Fiction"');
  console.log('New logic produces: "The Silent Patient by Alex Michaelides Hardcover Book Psychological Fiction"');
  console.log('Improvement: Preserved "Psychological" instead of removing the entire keyword');
  console.log('\n=== SUMMARY ===');
  console.log('1. If space allows: Keep full keyword + "Fiction"');
  console.log('2. If no space for full keyword: Keep first word + "Fiction"');
  console.log('3. If no space for first word: Use just "Fiction"');
  console.log('4. This maximizes keyword preservation while ensuring "Fiction" at the end');
}

testImprovedFictionLogic(); 