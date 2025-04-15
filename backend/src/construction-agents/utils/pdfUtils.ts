const fs = require("fs");
const pdfParse = require("pdf-parse");

module.exports = async function extractTextFromPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  return data.text;
};
