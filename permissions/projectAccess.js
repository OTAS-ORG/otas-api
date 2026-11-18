const mongoose = require('mongoose');
// RM-04: PD/DQA staff may read all money-free projects; finance and CEO read all.
// Sales-only reads are restricted by the project-level salesOwner reference.
const READ_ROLES = new Set(['ceo_bd', 'finance_admin', 'pd_head', 'developer', 'uiux', 'dqa_head', 'dqa']);
const rolesFor = user => Array.isArray(user?.roles) ? user.roles : [];
const canReadProjects = user => mongoose.isObjectIdOrHexString(user?._id) &&
  rolesFor(user).some(role => READ_ROLES.has(role) || role === 'sales');
// Always apply this predicate to the actual project query; never filter only
// after reading documents. Mixed roles take the union of their access.
const projectReadScope = user => {
  if (!canReadProjects(user)) return null;
  if (rolesFor(user).some(role => READ_ROLES.has(role))) return {};
  return { salesOwner: new mongoose.Types.ObjectId(user._id.toString()) };
};
// RM-15 requires the confirm_won command, which is not implemented yet.
const canCreateProject = () => false;
// Legacy text may contain CEO-only cost or unclassified sensitive information.
const canSeeProjectText = user => rolesFor(user).includes('ceo_bd');

// Legacy text has no verified money-free classification. Non-price roles get a
// stable alias until a separately classified name/description is available.
const presentProject = (user, row) => {
  const value = typeof row.toObject === 'function' ? row.toObject() : row;
  const result = {};
  if (canSeeProjectText(user)) {
    for (const key of ['_id', 'clientId', 'salesOwner', 'projectType', 'owner', 'supportingOwner', 'visitLead', 'createdAt', 'updatedAt', 'name', 'description', 'projectKey']) {
      if (value[key] !== undefined) result[key] = value[key];
    }
  } else {
    // Reject malformed legacy data rather than treating arbitrary strings as IDs.
    if (!mongoose.isObjectIdOrHexString(value._id)) return null;
    result._id = value._id;
    for (const key of ['clientId', 'salesOwner', 'owner', 'supportingOwner', 'visitLead']) {
      if (value[key] === null || mongoose.isObjectIdOrHexString(value[key])) result[key] = value[key];
    }
    if ([null, 'package', 'custom'].includes(value.projectType)) result.projectType = value.projectType;
    for (const key of ['createdAt', 'updatedAt']) if (value[key] instanceof Date && !Number.isNaN(value[key].getTime())) result[key] = value[key];
    const suffix = String(value._id).slice(-8).toUpperCase();
    result.name = `Project ${suffix}`;
    result.projectKey = `PRJ${suffix}`;
    result.description = '';
  }
  return result;
};

module.exports = { canReadProjects, projectReadScope, canCreateProject, canSeeProjectText, presentProject };
