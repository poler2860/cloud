const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get user by ID (own profile or admin only)
router.get('/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);

    // Check permission
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `SELECT id, email, first_name, last_name, role, status, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get all users (admin only)
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { status, role } = req.query;
    
    let query = `SELECT id, email, first_name, last_name, role, status, created_at
                 FROM users WHERE 1=1`;
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(role);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Update user status (admin only)
router.patch('/:id/status', requireAdmin, [
  body('status').isIn(['pending', 'active', 'inactive']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.params.id);
    const { status } = req.body;

    const result = await db.query(
      `UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, first_name, last_name, role, status, updated_at`,
      [status, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update user role (admin only)
router.patch('/:id/role', requireAdmin, [
  body('role').isIn(['user', 'admin']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.params.id);
    const { role } = req.body;

    // Prevent changing own role
    if (req.user.id === userId) {
      return res.status(403).json({ error: 'Cannot change your own role' });
    }

    const result = await db.query(
      `UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, first_name, last_name, role, status, updated_at`,
      [role, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update user profile (own profile only)
router.patch('/:id', [
  body('firstName').optional().notEmpty(),
  body('lastName').optional().notEmpty(),
  body('currentPassword').optional().notEmpty(),
  body('newPassword').optional().isLength({ min: 6 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.params.id);

    // Only allow updating own profile
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Can only update your own profile' });
    }

    const { firstName, lastName, currentPassword, newPassword } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (firstName) {
      paramCount++;
      updates.push(`first_name = $${paramCount}`);
      params.push(firstName);
    }

    if (lastName) {
      paramCount++;
      updates.push(`last_name = $${paramCount}`);
      params.push(lastName);
    }

    // Handle password change
    if (currentPassword && newPassword) {
      const userResult = await db.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const validPassword = await bcrypt.compare(
        currentPassword,
        userResult.rows[0].password_hash
      );

      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      paramCount++;
      updates.push(`password_hash = $${paramCount}`);
      params.push(newPasswordHash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    params.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')}
                   WHERE id = $${paramCount}
                   RETURNING id, email, first_name, last_name, role, status, updated_at`;

    const result = await db.query(query, params);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent deleting own account
    if (req.user.id === userId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
