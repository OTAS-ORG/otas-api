const Project = require('../models/Project');
const ProjectPlan = require('../models/ProjectPlan');
const ProjectMilestone = require('../models/ProjectMilestone');
const sendResponse = require('../utils/response');

// GET /api/project-plans/:projectId
// Retrieve project plan charter and its milestones
exports.getProjectPlan = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      return sendResponse(res, 404, false, 'Project not found');
    }

    let plan = await ProjectPlan.findOne({ projectId })
      .populate('projectId', 'name projectKey description')
      .populate('updatedBy', 'username');

    if (!plan) {
      // Auto-initialize an empty plan for convenient first-time usage
      plan = await ProjectPlan.create({
        projectId,
        charterContent: `<h2>🎯 Project Goals & Scope</h2><p>Outline project objectives, target deliverables, and scope boundaries here...</p><h2>⚠️ Risks & Mitigation Strategy</h2><p>Document key technical, operational, and delivery risks...</p>`,
        updatedBy: req.user._id,
      });
      plan = await ProjectPlan.findById(plan._id)
        .populate('projectId', 'name projectKey description')
        .populate('updatedBy', 'username');
    }

    const milestones = await ProjectMilestone.find({ project_id: projectId })
      .sort({ start_date: 1, createdAt: 1 })
      .populate('createdBy', 'username');

    sendResponse(res, 200, true, 'Project plan fetched successfully', {
      project,
      plan,
      milestones,
    });
  } catch (error) {
    console.error('Error in getProjectPlan:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// PUT /api/project-plans/:projectId/charter
// Update Project Charter rich text and core parameters
exports.saveProjectCharter = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { charterContent, scope, goals, risks, targetReleaseVersion } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return sendResponse(res, 404, false, 'Project not found');
    }

    const updateData = {
      updatedBy: req.user._id,
    };
    if (charterContent !== undefined) updateData.charterContent = charterContent;
    if (scope !== undefined) updateData.scope = scope;
    if (goals !== undefined) updateData.goals = goals;
    if (risks !== undefined) updateData.risks = risks;
    if (targetReleaseVersion !== undefined) updateData.targetReleaseVersion = targetReleaseVersion;

    const plan = await ProjectPlan.findOneAndUpdate(
      { projectId },
      { $set: updateData },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
      .populate('projectId', 'name projectKey description')
      .populate('updatedBy', 'username');

    sendResponse(res, 200, true, 'Project charter saved successfully', plan);
  } catch (error) {
    console.error('Error in saveProjectCharter:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// GET /api/project-plans/:projectId/milestones
// Get all milestones for a project
exports.getMilestones = async (req, res) => {
  try {
    const { projectId } = req.params;
    const milestones = await ProjectMilestone.find({ project_id: projectId })
      .sort({ start_date: 1, createdAt: 1 })
      .populate('createdBy', 'username');

    sendResponse(res, 200, true, 'Milestones fetched successfully', milestones);
  } catch (error) {
    console.error('Error in getMilestones:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// POST /api/project-plans/:projectId/milestones
// Create a new milestone
exports.createMilestone = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { phase_name, start_date, end_date, release_version, status, notes, sort_order } = req.body;

    if (!phase_name || !start_date || !end_date) {
      return sendResponse(res, 400, false, 'Phase name, start date, and end date are required');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return sendResponse(res, 404, false, 'Project not found');
    }

    const milestone = await ProjectMilestone.create({
      project_id: projectId,
      phase_name: phase_name.trim(),
      start_date: new Date(start_date),
      end_date: new Date(end_date),
      release_version: release_version ? release_version.trim() : 'v1.0',
      status: status || 'Pending',
      notes: notes ? notes.trim() : '',
      sort_order: Number(sort_order) || 0,
      createdBy: req.user._id,
    });

    const populated = await ProjectMilestone.findById(milestone._id).populate('createdBy', 'username');

    sendResponse(res, 201, true, 'Milestone created successfully', populated);
  } catch (error) {
    console.error('Error in createMilestone:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// PUT /api/project-plans/:projectId/milestones/:id
// Update an existing milestone
exports.updateMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { phase_name, start_date, end_date, release_version, status, notes, sort_order } = req.body;

    const milestone = await ProjectMilestone.findById(id);
    if (!milestone) {
      return sendResponse(res, 404, false, 'Milestone not found');
    }

    if (phase_name !== undefined) milestone.phase_name = phase_name.trim();
    if (start_date !== undefined) milestone.start_date = new Date(start_date);
    if (end_date !== undefined) milestone.end_date = new Date(end_date);
    if (release_version !== undefined) milestone.release_version = release_version.trim();
    if (status !== undefined) milestone.status = status;
    if (notes !== undefined) milestone.notes = notes.trim();
    if (sort_order !== undefined) milestone.sort_order = Number(sort_order) || 0;

    await milestone.save();

    const populated = await ProjectMilestone.findById(id).populate('createdBy', 'username');
    sendResponse(res, 200, true, 'Milestone updated successfully', populated);
  } catch (error) {
    console.error('Error in updateMilestone:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// DELETE /api/project-plans/:projectId/milestones/:id
// Delete a milestone
exports.deleteMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const milestone = await ProjectMilestone.findByIdAndDelete(id);
    if (!milestone) {
      return sendResponse(res, 404, false, 'Milestone not found');
    }
    sendResponse(res, 200, true, 'Milestone deleted successfully');
  } catch (error) {
    console.error('Error in deleteMilestone:', error);
    sendResponse(res, 500, false, error.message);
  }
};

// GET /api/project-plans/widget/summary
// Summary for Dashboard Widget: upcoming release, timeline duration & progress
exports.getDashboardWidgetSummary = async (req, res) => {
  try {
    const { projectId } = req.query;

    const projects = await Project.find().sort({ createdAt: -1 }).select('_id name projectKey description');
    if (projects.length === 0) {
      return sendResponse(res, 200, true, 'No projects available', {
        projects: [],
        selectedProject: null,
        upcomingRelease: null,
        timeline: null,
      });
    }

    // Determine target project
    let targetProject = null;
    if (projectId) {
      targetProject = projects.find(p => p._id.toString() === projectId);
    }
    if (!targetProject) {
      targetProject = projects[0];
    }

    const milestones = await ProjectMilestone.find({ project_id: targetProject._id })
      .sort({ start_date: 1, createdAt: 1 });

    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter(m => m.status === 'Completed').length;
    const inProgressMilestones = milestones.filter(m => m.status === 'In-Progress').length;
    const pendingMilestones = milestones.filter(m => m.status === 'Pending').length;

    const progressPercentage = totalMilestones > 0
      ? Math.round((completedMilestones / totalMilestones) * 100)
      : 0;

    // Upcoming Release:
    // Find the nearest upcoming milestone where end_date >= start of today and status !== 'Completed'
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingCandidates = milestones.filter(m => {
      const end = new Date(m.end_date);
      return end >= today && m.status !== 'Completed';
    });

    let upcomingRelease = null;
    if (upcomingCandidates.length > 0) {
      upcomingRelease = upcomingCandidates[0]; // First in chronological order
    } else if (milestones.length > 0) {
      // Fallback: the latest milestone or the first incomplete one
      upcomingRelease = milestones.find(m => m.status !== 'Completed') || milestones[milestones.length - 1];
    }

    // Overall duration
    let overallStartDate = null;
    let overallEndDate = null;
    if (milestones.length > 0) {
      const startTimes = milestones.map(m => new Date(m.start_date).getTime());
      const endTimes = milestones.map(m => new Date(m.end_date).getTime());
      overallStartDate = new Date(Math.min(...startTimes));
      overallEndDate = new Date(Math.max(...endTimes));
    }

    let daysRemaining = null;
    if (upcomingRelease) {
      const diffTime = new Date(upcomingRelease.end_date).getTime() - new Date().getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Prepare milestones with timeline positioning percentage for responsive horizontal visual timeline
    let timelineMilestones = [];
    if (overallStartDate && overallEndDate) {
      const totalSpan = overallEndDate.getTime() - overallStartDate.getTime() || 1;
      timelineMilestones = milestones.map(m => {
        const mStart = new Date(m.start_date).getTime();
        const mEnd = new Date(m.end_date).getTime();
        const startPercent = Math.max(0, Math.min(100, Math.round(((mStart - overallStartDate.getTime()) / totalSpan) * 100)));
        const endPercent = Math.max(0, Math.min(100, Math.round(((mEnd - overallStartDate.getTime()) / totalSpan) * 100)));
        return {
          _id: m._id,
          phase_name: m.phase_name,
          release_version: m.release_version,
          status: m.status,
          start_date: m.start_date,
          end_date: m.end_date,
          startPercent,
          endPercent,
        };
      });
    }

    sendResponse(res, 200, true, 'Dashboard widget summary fetched successfully', {
      projects,
      selectedProject: targetProject,
      upcomingRelease: upcomingRelease ? {
        _id: upcomingRelease._id,
        phase_name: upcomingRelease.phase_name,
        release_version: upcomingRelease.release_version,
        start_date: upcomingRelease.start_date,
        end_date: upcomingRelease.end_date,
        status: upcomingRelease.status,
        daysRemaining,
      } : null,
      timeline: {
        overallStartDate,
        overallEndDate,
        totalMilestones,
        completedMilestones,
        inProgressMilestones,
        pendingMilestones,
        progressPercentage,
        milestones: timelineMilestones,
      },
    });
  } catch (error) {
    console.error('Error in getDashboardWidgetSummary:', error);
    sendResponse(res, 500, false, error.message);
  }
};
