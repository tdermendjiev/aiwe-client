const materialAgent = require("./materialAgent");
const seismicAgent = require("./seismicAgent");
const projectAgent = require("./projectAgent");
const evaluatorAgent = require("../evaluator/evaluatorAgent");

module.exports = async function orchestrator(files) {
  const materials = await materialAgent(files.materials[0].path);
  const seismic = await seismicAgent(files.seismic[0].path);
  const project = await projectAgent(files.project[0].path);
  const reportPath = await evaluatorAgent(materials, seismic, project);
  return reportPath;
};
