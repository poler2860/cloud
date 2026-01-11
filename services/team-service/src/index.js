const express = require('express');
const cors = require('cors');
const teamRoutes = require('./routes/teams');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'team-service' });
});

// Routes
app.use('/api/teams', teamRoutes);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Team Service running on port ${PORT}`);
});
