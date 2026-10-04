const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger.json');
const appointmentRoutes = require('./routes/appointment.routes');
const appointmentController = require('./controllers/appointment.controller');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false // Allows Swagger UI to render assets cleanly
  })
);

// Cross-Origin Resource Sharing
app.use(cors());

// Body Parsers with safe limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Lightweight Request Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration
      },
      'Incoming HTTP request'
    );
  });
  next();
});

// Health check endpoint
app.get('/health', appointmentController.getHealth);

// Root endpoint: automatically redirect visitors to interactive API docs
app.get('/', (req, res) => {
  res.redirect('/api/docs');
});

// Interactive OpenAPI / Swagger Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Appointment Scheduler API Documentation'
}));

// API v1 Routes
app.use('/api/v1', appointmentRoutes);

// Fallback 404 Handler
app.use(notFoundHandler);

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
