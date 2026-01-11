const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all teams (for current user or all if admin)
router.get('/', async (req, res, next) => {
  try {
    let query;
    let params;

    if (req.user.role === 'admin') {
      // Admin can see all teams
      query = `
        SELECT t.*, 
               u.first_name || ' ' || u.last_name as leader_name,
               u.email as leader_email,
               COUNT(DISTINCT tm.user_id) as member_count
        FROM teams t
        LEFT JOIN users u ON t.leader_id = u.id
        LEFT JOIN team_members tm ON t.id = tm.team_id
        GROUP BY t.id, u.first_name, u.last_name, u.email
        ORDER BY t.created_at DESC
      `;
      params = [];
    } else {
      // Regular users see only teams they're part of
      query = `
        SELECT t.*, 
               u.first_name || ' ' || u.last_name as leader_name,
               u.email as leader_email,
               COUNT(DISTINCT tm.user_id) as member_count
        FROM teams t
        LEFT JOIN users u ON t.leader_id = u.id
        LEFT JOIN team_members tm ON t.id = tm.team_id
        WHERE t.id IN (
          SELECT team_id FROM team_members WHERE user_id = $1
        )
        GROUP BY t.id, u.first_name, u.last_name, u.email
        ORDER BY t.created_at DESC
      `;
      params = [req.user.id];
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get team by ID
router.get('/:id', async (req, res, next) => {
  try {
    const teamId = parseInt(req.params.id);

    const teamResult = await db.query(
      `SELECT t.*, 
              u.first_name || ' ' || u.last_name as leader_name,
              u.email as leader_email
       FROM teams t
       LEFT JOIN users u ON t.leader_id = u.id
       WHERE t.id = $1`,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teamResult.rows[0];

    // Check permission (admin, team leader, or team member)
    if (req.user.role !== 'admin' && team.leader_id !== req.user.id) {
      const memberCheck = await db.query(
        'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
        [teamId, req.user.id]
      );

      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get team members
    const membersResult = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, tm.joined_at
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY tm.joined_at`,
      [teamId]
    );

    team.members = membersResult.rows;
    res.json(team);
  } catch (error) {
    next(error);
  }
});

// Create team (admin only)
router.post('/', requireAdmin, [
  body('name').notEmpty(),
  body('description').optional(),
  body('leaderId').isInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, leaderId } = req.body;

    // Check if user is already a team leader
    const existingLeader = await db.query(
      'SELECT id, name FROM teams WHERE leader_id = $1',
      [leaderId]
    );

    if (existingLeader.rows.length > 0) {
      return res.status(400).json({ 
        error: `User is already a leader of team: ${existingLeader.rows[0].name}. A user can only lead one team.` 
      });
    }

    // Check if user is a member of other teams
    const existingMemberships = await db.query(
      'SELECT COUNT(*) as count FROM team_members WHERE user_id = $1',
      [leaderId]
    );

    if (parseInt(existingMemberships.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'User is already a member of other teams. A team leader cannot be a member of other teams.' 
      });
    }

    const result = await db.query(
      `INSERT INTO teams (name, description, leader_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description || null, leaderId]
    );

    const team = result.rows[0];

    // Add leader as a team member
    await db.query(
      'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)',
      [team.id, leaderId]
    );

    res.status(201).json(team);
  } catch (error) {
    next(error);
  }
});

// Update team (admin or team leader)
router.put('/:id', [
  body('name').optional().notEmpty(),
  body('description').optional(),
  body('leaderId').optional().isInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const teamId = parseInt(req.params.id);
    const { name, description, leaderId } = req.body;

    // Check team exists and get current leader
    const teamCheck = await db.query(
      'SELECT leader_id FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check permission (admin or team leader)
    if (req.user.role !== 'admin' && teamCheck.rows[0].leader_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const params = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(name);
    }

    if (description !== undefined) {
      paramCount++;
      updates.push(`description = $${paramCount}`);
      params.push(description);
    }

    // Only admin can change leader
    if (leaderId !== undefined) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can change team leader' });
      }

      // Check if new leader is already a leader of another team
      const existingLeader = await db.query(
        'SELECT id, name FROM teams WHERE leader_id = $1 AND id != $2',
        [leaderId, teamId]
      );

      if (existingLeader.rows.length > 0) {
        return res.status(400).json({ 
          error: `User is already a leader of team: ${existingLeader.rows[0].name}. A user can only lead one team.` 
        });
      }

      // Check if new leader is a member of other teams
      const existingMemberships = await db.query(
        'SELECT COUNT(*) as count FROM team_members WHERE user_id = $1 AND team_id != $2',
        [leaderId, teamId]
      );

      if (parseInt(existingMemberships.rows[0].count) > 0) {
        return res.status(400).json({ 
          error: 'User is a member of other teams. A team leader cannot be a member of other teams.' 
        });
      }

      paramCount++;
      updates.push(`leader_id = $${paramCount}`);
      params.push(leaderId);

      // Ensure new leader is a member of this team
      await db.query(
        'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [teamId, leaderId]
      );
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(teamId);

    const query = `UPDATE teams SET ${updates.join(', ')}
                   WHERE id = $${paramCount}
                   RETURNING *`;

    const result = await db.query(query, params);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete team (admin only)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const teamId = parseInt(req.params.id);

    const result = await db.query(
      'DELETE FROM teams WHERE id = $1 RETURNING id',
      [teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Add member to team (admin or team leader)
router.post('/:id/members', [
  body('userId').isInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const teamId = parseInt(req.params.id);
    const { userId } = req.body;

    // Check team exists and get leader
    const teamCheck = await db.query(
      'SELECT leader_id FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check permission (admin or team leader)
    if (req.user.role !== 'admin' && teamCheck.rows[0].leader_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if user is already a leader of another team
    const isLeader = await db.query(
      'SELECT id, name FROM teams WHERE leader_id = $1',
      [userId]
    );

    if (isLeader.rows.length > 0) {
      return res.status(400).json({ 
        error: `User is a leader of team: ${isLeader.rows[0].name}. A team leader cannot be a member of other teams.` 
      });
    }

    // Add member
    await db.query(
      'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [teamId, userId]
    );

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    next(error);
  }
});

// Remove member from team (admin or team leader)
router.delete('/:id/members/:userId', async (req, res, next) => {
  try{
    const teamId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    // Check team exists and get leader
    const teamCheck = await db.query(
      'SELECT leader_id FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check permission (admin or team leader)
    if (req.user.role !== 'admin' && teamCheck.rows[0].leader_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Add member
    await db.query(
      'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [teamId, userId]
    );

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    next(error);
  }
});

// Remove member from team (admin or team leader)
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const teamId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    // Check team exists and get leader
    const teamCheck = await db.query(
      'SELECT leader_id FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check permission (admin or team leader)
    if (req.user.role !== 'admin' && teamCheck.rows[0].leader_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prevent removing team leader
    if (userId === teamCheck.rows[0].leader_id) {
      return res.status(400).json({ error: 'Cannot remove team leader from team' });
    }

    const result = await db.query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING id',
      [teamId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in team' });
    }

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
