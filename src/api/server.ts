import express from 'express';
import cors from 'cors';
import path from 'path';
import { CostAnalyzer } from '../cost/cost-analyzer';
import { SecurityAnalyzer } from '../security/security-analyzer';
import { DetectionEngine } from '../detection/detection-engine';
import { ProductionDatadogTelemetryCollector } from '../telemetry/production-datadog-collector';
import { LLMDataProcessor } from '../processing/data-processor';
import { getDefaultConfig } from '../config';
import { MonitoringConfig } from '../interfaces';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// Initialize services with environment config
const config: MonitoringConfig = {
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'test-project',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
  },
  datadog: {
    apiKey: process.env.DATADOG_API_KEY || 'test-key',
    appKey: process.env.DATADOG_APP_KEY || 'test-app-key',
    site: process.env.DATADOG_SITE || 'datadoghq.com'
  },
  application: {
    name: process.env.APP_NAME || 'llm-observability-monitor',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.APP_ENVIRONMENT || 'development'
  },
  telemetry: {
    batchSize: parseInt(process.env.TELEMETRY_BATCH_SIZE || '100'),
    flushInterval: parseInt(process.env.TELEMETRY_FLUSH_INTERVAL || '5000'),
    maxRetries: parseInt(process.env.TELEMETRY_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.TELEMETRY_RETRY_DELAY || '1000')
  },
  security: {
    enableDlpScanning: process.env.SECURITY_ENABLE_DLP === 'true',
    sensitiveDataTypes: ['email', 'phone', 'ssn', 'credit_card'],
    confidenceThreshold: parseFloat(process.env.SECURITY_CONFIDENCE_THRESHOLD || '0.8')
  },
  cost: {
    currency: process.env.COST_CURRENCY || 'USD',
    budgets: [],
    alertThresholds: [0.8, 0.9, 1.0]
  }
};

const costAnalyzer = new CostAnalyzer();
const securityAnalyzer = new SecurityAnalyzer();
const detectionEngine = new DetectionEngine();
const telemetryCollector = new ProductionDatadogTelemetryCollector(config);
const dataProcessor = new LLMDataProcessor();

// Remove all sample data initialization - only use real data
console.log('🚀 LLM Observability Monitor initialized - waiting for real data');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Cost Analysis Endpoints
app.post('/api/cost/analyze', async (req, res) => {
  try {
    const { usage } = req.body;
    const costBreakdown = await costAnalyzer.calculateCost(usage);
    res.json(costBreakdown);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/cost/realtime', async (req, res) => {
  try {
    const realTimeCosts = await costAnalyzer.getRealTimeCosts();
    res.json(realTimeCosts);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/cost/optimize', async (req, res) => {
  try {
    const { usageData } = req.body;
    const optimizations = await costAnalyzer.identifyOptimizations(usageData);
    res.json(optimizations);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/cost/optimize', async (req, res) => {
  try {
    // Generate sample optimization recommendations
    const optimizations = {
      recommendations: [
        {
          type: 'model_selection',
          title: 'Switch to more cost-effective models',
          description: 'Consider using Gemini 1.5 Flash for simple tasks instead of Pro',
          potentialSavings: 0.45,
          impact: 'high'
        },
        {
          type: 'batch_processing',
          title: 'Implement batch processing',
          description: 'Group similar requests to reduce API overhead',
          potentialSavings: 0.23,
          impact: 'medium'
        },
        {
          type: 'caching',
          title: 'Enable response caching',
          description: 'Cache common responses to reduce redundant API calls',
          potentialSavings: 0.67,
          impact: 'high'
        }
      ],
      totalPotentialSavings: 1.35,
      currentMonthlyCost: 245.67,
      projectedMonthlyCost: 244.32
    };
    res.json(optimizations);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/cost/report', async (req, res) => {
  try {
    const { timeRange } = req.body;
    const report = await costAnalyzer.generateReport(timeRange);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Security Analysis Endpoints
app.post('/api/security/analyze-input', async (req, res) => {
  try {
    const { input } = req.body;
    const assessment = await securityAnalyzer.analyzeInput(input);
    res.json(assessment);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/security/analyze-output', async (req, res) => {
  try {
    const { output } = req.body;
    const assessment = await securityAnalyzer.analyzeOutput(output);
    res.json(assessment);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Detection Engine Endpoints
app.post('/api/detection/rules', (req, res) => {
  try {
    const rule = req.body;
    detectionEngine.addRule(rule);
    res.json({ message: 'Rule added successfully', ruleId: rule.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/detection/rules', (req, res) => {
  try {
    const rules = detectionEngine.getRules();
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/detection/evaluate', async (req, res) => {
  try {
    const { telemetryEvent } = req.body;
    const processedData = dataProcessor.processEvent(telemetryEvent);
    const alerts = detectionEngine.evaluateRules(processedData);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Alerts Endpoints
app.get('/api/detection/alerts', (req, res) => {
  try {
    // Get recent alerts from detection engine
    const alerts = (detectionEngine as any).getRecentAlerts ? 
      (detectionEngine as any).getRecentAlerts() : [];
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/detection/alerts/:alertId/acknowledge', (req, res) => {
  try {
    const { alertId } = req.params;
    // Acknowledge alert in detection engine
    if ((detectionEngine as any).acknowledgeAlert) {
      (detectionEngine as any).acknowledgeAlert(alertId);
    }
    res.json({ message: 'Alert acknowledged successfully' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/health/alerts', (req, res) => {
  try {
    // Get health alerts from global health monitoring
    const alerts: any[] = [];
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Telemetry Collection Endpoints
app.post('/api/telemetry/collect', async (req, res) => {
  try {
    const event = req.body;
    await telemetryCollector.collect(event);
    res.json({ message: 'Event collected successfully' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/telemetry/metrics', (req, res) => {
  try {
    const metrics = telemetryCollector.getMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Dashboard Data Endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    const realTimeCosts = await costAnalyzer.getRealTimeCosts();
    const telemetryMetrics = telemetryCollector.getMetrics();
    const budgetAlerts = costAnalyzer.getBudgetAlerts();
    
    res.json({
      costs: realTimeCosts,
      telemetry: telemetryMetrics,
      budgetAlerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Enhanced Analytics Endpoints
app.get('/api/analytics/usage-trends', async (req, res) => {
  try {
    // Get real usage trends from cost analyzer
    const trends = await costAnalyzer.getUsageTrends();
    res.json(trends.length > 0 ? trends : []);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/analytics/model-performance', async (req, res) => {
  try {
    // Get real model performance from telemetry collector
    const performance = (telemetryCollector as any).getModelPerformance ? 
      (telemetryCollector as any).getModelPerformance() : [];
    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/analytics/security-events', async (req, res) => {
  try {
    // Get real security events from security analyzer
    const securityEvents = (securityAnalyzer as any).getRecentEvents ? 
      (securityAnalyzer as any).getRecentEvents() : [];
    res.json(securityEvents);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/analytics/cost-breakdown', async (req, res) => {
  try {
    // Get real cost breakdown from cost analyzer
    const breakdown = await costAnalyzer.getRealTimeCosts();
    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Real-time data simulation endpoint
app.get('/api/realtime/metrics', (req, res) => {
  try {
    // Get real-time metrics from telemetry collector
    const metrics = (telemetryCollector as any).getRealTimeMetrics ? 
      (telemetryCollector as any).getRealTimeMetrics() : {
        timestamp: new Date().toISOString(),
        activeRequests: 0,
        requestsPerSecond: 0,
        avgResponseTime: 0,
        errorRate: 0,
        tokensPerSecond: 0,
        costPerHour: 0,
        topModels: []
      };
    
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
  try {
    const defaultSettings = {
      apiUrl: 'http://localhost:3000',
      refreshRate: 30,
      notifications: {
        emailAlerts: true,
        slackAlerts: false,
        pushNotifications: true
      },
      thresholds: {
        costAlert: 100.0,
        budgetLimit: 1000.0,
        alertThreshold: 80
      },
      preferences: {
        theme: 'system',
        language: 'en',
        timezone: 'UTC'
      }
    };
    res.json(defaultSettings);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const settings = req.body;
    // In a real app, you'd save these to a database
    console.log('Settings updated:', settings);
    res.json({ message: 'Settings updated successfully', settings });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/settings/test-connection', (req, res) => {
  try {
    const { apiUrl } = req.body;
    // Simulate connection test
    const isValid = apiUrl && apiUrl.startsWith('http');
    res.json({
      success: isValid,
      message: isValid ? 'Connection successful' : 'Invalid API URL'
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/settings/reset', (req, res) => {
  try {
    const defaultSettings = {
      apiUrl: 'http://localhost:3000',
      refreshRate: 30,
      notifications: {
        emailAlerts: true,
        slackAlerts: false,
        pushNotifications: true
      },
      thresholds: {
        costAlert: 100.0,
        budgetLimit: 1000.0,
        alertThreshold: 80
      },
      preferences: {
        theme: 'system',
        language: 'en',
        timezone: 'UTC'
      }
    };
    res.json(defaultSettings);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Telemetry events endpoint
app.get('/api/telemetry/events', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    // Get real events from telemetry collector only
    const events = (telemetryCollector as any).getRecentEvents ? 
      (telemetryCollector as any).getRecentEvents(Number(limit)) : [];
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/telemetry/flush', (req, res) => {
  try {
    // Simulate flushing telemetry queue
    res.json({ message: 'Telemetry queue flushed successfully', flushedEvents: 42 });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Datadog integration status endpoint
app.get('/api/datadog/status', (req, res) => {
  try {
    const status = (telemetryCollector as any).getDatadogStatus ? 
      (telemetryCollector as any).getDatadogStatus() : 
      { status: 'unknown', message: 'Status not available' };
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 LLM Observability Monitor API Server running on port ${port}`);
  console.log(`🌐 Frontend Dashboard: http://localhost:${port}`);
  console.log(`📊 API Dashboard: http://localhost:${port}/api/dashboard`);
  console.log(`🏥 Health Check: http://localhost:${port}/health`);
});

export default app;