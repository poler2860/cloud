const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.details,
    });
  }

  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Resource already exists',
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
};

module.exports = { errorHandler };
