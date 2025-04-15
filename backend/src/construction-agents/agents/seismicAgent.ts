const extractTextFromPDF = require("../utils/pdfUtils");

module.exports = async function seismicAgent(pdfPath) {
  const text = await extractTextFromPDF(pdfPath);
  // TODO: Parse text into structured seismic rules
  return {
    rawText: text,
    rules: text.match(/Rule:.*?\n/g) || [],
  };
};
