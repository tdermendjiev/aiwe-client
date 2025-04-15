const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun } = require("docx");

module.exports = async function evaluatorAgent(materials, seismic, project) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun("Project Evaluation Report\n\n"),
              new TextRun(
                "Materials:\n" +
                  JSON.stringify(materials.materials, null, 2) +
                  "\n\n"
              ),
              new TextRun(
                "Seismic Rules:\n" +
                  JSON.stringify(seismic.rules, null, 2) +
                  "\n\n"
              ),
              new TextRun(
                "Project Plans:\n" + JSON.stringify(project.plans, null, 2)
              ),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(__dirname, "../reports/evaluation.docx");
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
};
