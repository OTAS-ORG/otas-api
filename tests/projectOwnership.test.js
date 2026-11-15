const mongoose = require('mongoose');
const Project = require('../models/Project');

test('legacy project remains valid without assigning an owner', async () => {
  const project = new Project({ name: 'Fictional', projectKey: 'FIC' });
  await project.validate();
  expect(project.owner).toBeNull();
  expect(project.clientId).toBeNull();
  expect(project.projectType).toBeNull();
});

test('stores explicit customer and project responsibility references', async () => {
  const owner = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  const project = new Project({ name: 'Fictional', projectKey: 'FIC', projectType: 'custom', owner, clientId });
  await project.validate();
  expect(project.owner.equals(owner)).toBe(true);
  expect(project.clientId.equals(clientId)).toBe(true);
});

test('rejects unknown project types', async () => {
  const project = new Project({ name: 'Fictional', projectKey: 'FIC', projectType: 'unknown' });
  await expect(project.validate()).rejects.toThrow();
});
