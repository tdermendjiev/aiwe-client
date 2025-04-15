const extractTextFromPDF = require("../utils/pdfUtils");

module.exports = async function materialAgent(pdfPath) {
  const text = await extractTextFromPDF(pdfPath);
  // TODO: Parse text into structured material data
  return {
    rawText: text,
    materials: text.match(/Material:.*?\n/g) || [],
  };
};
