const extractTextFromPDF = require('../utils/pdfUtils');

module.exports = async function projectAgent(pdfPath) {
  const text = await extractTextFromPDF(pdfPath);
  // TODO: Parse text into structured project info
  return {
    rawText: text,
    plans: text.match(/Plan:.*?\n/g) || []
  };
};