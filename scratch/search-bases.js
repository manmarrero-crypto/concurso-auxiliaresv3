const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function search() {
  const pdfPath = 'C:/Users/Educacion/.gemini/antigravity/brain/43b5fe1f-6f73-4cd6-9196-8632dd0a0ed1/.user_uploaded/media_1791618770058_cd2c8706.pdf';
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  
  const text = result.text || '';
  console.log('Longitud texto PDF:', text.length);
  
  const keywords = ['resulta', 'resultas', 'adjudica', 'provisional', 'definitiv', 'preferen'];
  const lines = text.split('\n');
  lines.forEach((l, idx) => {
    const lLower = l.toLowerCase();
    if (keywords.some(k => lLower.includes(k))) {
      console.log(`L${idx}: ${l.trim()}`);
    }
  });
}

search().catch(console.error);
