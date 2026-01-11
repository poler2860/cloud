const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Helper function to check if user is team leader
async function isTeamLeader(userId, teamId) {
  const result = await db.query(
    'SELECT id FROM teams WHERE id = $1 AND leader_id = $2',
    [teamId, userId]
  );
  return result.rows.length > 0;
}

// Helper function to check if user is team member
async function isTeamMember(userId, teamId) {
  const result = await db.query(
    'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  return result.rows.length > 0;
}

// Get all tasks for current user
router.get('/', async (req, res, next) => {
  try {
    const { status, teamId } = req.query;

    let query = `
      SELECT t.*,
             team.name as team_name,
             assignee.first_name || ' ' || assignee.last_name as assignee_name,
             reporter.first_name || ' ' || reporter.last_name as reporter_name
      FROM tasks t
      LEFT JOIN teams team ON t.team_id = team.id
      LEFT JOIN users assignee ON t.assignee_id = assignee.id
      LEFT JOIN users reporter ON t.reporter_id = reporter.id
      WHERE t.team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $1
      )
    `;
    const params = [req.user.id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
    }

    if (teamId) {
      paramCount++;
      query += ` AND t.team_id = $${paramCount}`;
      params.push(parseInt(teamId));
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get tasks assigned to current user
router.get('/my-tasks', async (req, res, next) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT t.*,
             team.name as team_name,
             assignee.first_name || ' ' || assignee.last_name as assignee_name,
             reporter.first_name || ' ' || reporter.last_name as reporter_name
      FROM tasks t
      LEFT JOIN teams team ON t.team_id = team.id
      LEFT JOIN users assignee ON t.assignee_id = assignee.id
      LEFT JOIN users reporter ON t.reporter_id = reporter.id
      WHERE t.assignee_id = $1
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND t.status = $2';
      params.push(status);
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get task by ID
router.get('/:id', async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id);

    const taskResult = await db.query(
      `SELECT t.*,
              team.name as team_name,
              assignee.first_name || ' ' || assignee.last_name as assignee_name,
              assignee.email as assignee_email,
              reporter.first_name || ' ' || reporter.last_name as reporter_name,
              reporter.email as reporter_email
       FROM tasks t
       LEFT JOIN teams team ON t.team_id = team.id
       LEFT JOIN users assignee ON t.assignee_id = assignee.id
       LEFT JOIN users reporter ON t.reporter_id = reporter.id
       WHERE t.id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Check if user has access (must be team member)
    const isMember = await isTeamMember(req.user.id, task.team_id);
    if (!isMember && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get comments
    const commentsResult = await db.query(
      `SELECT c.*,
              u.first_name || ' ' || u.last_name as user_name,
              u.email as user_email
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.task_id = $1
       ORDER BY c.created_at DESC`,
      [taskId]
    );

    task.comments = commentsResult.rows;
    res.json(task);
  } catch (error) {
    next(error);
  }
});

// Create task (team leader only)
router.post('/', [
  body('title').notEmpty(),
  body('description').optional(),
  body('teamId').isInt(),
  body('assigneeId').optional().isInt(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('dueDate').optional().isISO8601(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, teamId, assigneeId, priority, dueDate } = req.body;

    // Check if user is team leader
    const isLeader = await isTeamLeader(req.user.id, teamId);
    if (!isLeader) {
      return res.status(403).json({ error: 'Only team leaders can create tasks' });
    }

    // If assignee specified, verify they're team member
    if (assigneeId) {
      const isMember = await isTeamMember(assigneeId, teamId);
      if (!isMember) {
        return res.status(400).json({ error: 'Assignee must be a team member' });
      }
    }

    const result = await db.query(
      `INSERT INTO tasks (title, description, team_id, assignee_id, reporter_id, priority, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'todo')
       RETURNING *`,
      [title, description || null, teamId, assigneeId || null, req.user.id, priority || 'medium', dueDate || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update task (team leader only)
router.put('/:id', [
  body('title').optional().notEmpty(),
  body('description').optional(),
  body('assigneeId').optional().isInt(),
  body('status').optional().isIn(['todo', 'in_progress', 'in_review', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('dueDate').optional().isISO8601(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = parseInt(req.params.id);
    const { title, description, assigneeId, status, priority, dueDate } = req.body;

    // Check task exists and get team
    const taskCheck = await db.query(
      'SELECT team_id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const teamId = taskCheck.rows[0].team_id;

    // Check if user is team leader
    const isLeader = await isTeamLeader(req.user.id, teamId);
    if (!isLeader) {
      return res.status(403).json({ error: 'Only team leaders can update tasks' });
    }

    // If assignee specified, verify they're team member
    if (assigneeId) {
      const isMember = await isTeamMember(assigneeId, teamId);
      if (!isMember) {
        return res.status(400).json({ error: 'Assignee must be a team member' });
      }
    }

    const updates = [];
    const params = [];
    let paramCount = 0;

    if (title !== undefined) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      params.push(title);
    }

    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }

    if (assigneeId !== undefined) {
      paramCount++;
      updates.push(`assignee_id = $${paramCount}`);
      params.push(assigneeId);
    }

    if (status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
    }

    if (priority !== undefined) {
      paramCount++;
      updates.push(`priority = $${paramCount}`);
      params.push(priority);
    }

    if (dueDate !== undefined) {
      paramCount++;
      updates.push(`due_date = $${paramCount}`);
      params.push(dueDate);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(taskId);

    const query = `UPDATE tasks SET ${updates.join(', ')}
                   WHERE id = $${paramCount}
                   RETURNING *`;

    const result = await db.query(query, params);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete task (team leader only)
router.delete('/:id', async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id);

    // Check task exists and get team
    const taskCheck = await db.query(
      'SELECT team_id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const teamId = taskCheck.rows[0].team_id;

    // Check if user is team leader
    const isLeader = await isTeamLeader(req.user.id, teamId);
    if (!isLeader) {
      return res.status(403).json({ error: 'Only team leaders can delete tasks' });
    }

    await db.query('DELETE FROM tasks WHERE id = $1', [taskId]);

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Add comment to task (team members)
router.post('/:id/comments', [
  body('content').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = parseInt(req.params.id);
    const { content } = req.body;

    // Check task exists and get team
    const taskCheck = await db.query(
      'SELECT team_id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const teamId = taskCheck.rows[0].team_id;

    // Check if user is team member
    const isMember = await isTeamMember(req.user.id, teamId);
    if (!isMember) {
      return res.status(403).json({ error: 'Only team members can comment on tasks' });
    }

    const result = await db.query(
      `INSERT INTO comments (task_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [taskId, req.user.id, content]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get comments for a task
router.get('/:id/comments', async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id);

    // Check task exists and get team
    const taskCheck = await db.query(
      'SELECT team_id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const teamId = taskCheck.rows[0].team_id;

    // Check if user is team member
    const isMember = await isTeamMember(req.user.id, teamId);
    if (!isMember && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `SELECT c.*,
              u.first_name || ' ' || u.last_name as user_name,
              u.email as user_email
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.task_id = $1
       ORDER BY c.created_at DESC`,
      [taskId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
