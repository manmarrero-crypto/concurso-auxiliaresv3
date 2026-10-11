const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function printSections() {
  const pdfPath = 'C:/Users/Educacion/.gemini/antigravity/brain/43b5fe1f-6f73-4cd6-9196-8632dd0a0ed1/.user_uploaded/media_1791618770058_cd2c8706.pdf';
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  const lines = result.text.split('\n');
  
  console.log('=== LINEAS 35 A 90 ===');
  for (let i = 35; i <= 90; i++) {
    if (lines[i]) console.log(`${i}: ${lines[i]}`);
  }
}

printSections().catch(console.error);
