const express = require('express');
const cors = require('cors');
const taskRoutes = require('./routes/tasks');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'task-service' });
});

// Routes
app.use('/api/tasks', taskRoutes);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Task Service running on port ${PORT}`);
});
