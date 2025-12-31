# LLM Observability Monitor - Deployment Guide

This guide provides comprehensive instructions for deploying the LLM Observability Monitor in various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Configuration](#configuration)
- [Deployment Options](#deployment-options)
- [Monitoring Setup](#monitoring-setup)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Node.js**: Version 16.x or higher
- **Memory**: Minimum 1GB RAM, recommended 2GB+
- **Storage**: Minimum 1GB free space
- **Network**: Outbound HTTPS access to Google Cloud and Datadog APIs

### Required Services

1. **Google Cloud Platform** (for real implementations)
   - Vertex AI API enabled (for real LLM interactions)
   - Cloud DLP API enabled (for real sensitive data detection)
   - Service account with appropriate permissions
   - Valid billing account for Vertex AI usage

2. **Datadog Account** (for real monitoring)
   - API key with metrics and logs write permissions
   - Application key for dashboard management and creation
   - Appropriate site configuration (datadoghq.com, datadoghq.eu, etc.)

3. **Implementation Options**
   - **Real Implementation**: Uses actual Google Cloud services and Datadog
   - **Mock Implementation**: Uses simulated services for development/testing
   - **Hybrid**: Real services with mock fallback for resilience

### Dependencies

```bash
# Install Node.js dependencies
npm install

# Install additional tools (optional)
npm install -g pm2  # For production process management
```

## Environment Setup

### Quick Setup

Use the interactive setup script to configure your environment:

```bash
npm run setup
```

This will guide you through:
- Choosing real vs mock implementation
- Configuring Google Cloud credentials
- Setting up Datadog integration
- Creating the appropriate `.env` file

### 1. Google Cloud Setup (Real Implementation)

#### Enable Required APIs

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Enable Cloud DLP API
gcloud services enable dlp.googleapis.com

# Enable Cloud Logging API (optional)
gcloud services enable logging.googleapis.com
```

#### Create Service Account

```bash
# Create service account
gcloud iam service-accounts create llm-monitor-sa \
    --display-name="LLM Observability Monitor Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:llm-monitor-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:llm-monitor-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/dlp.user"

# Create and download service account key
gcloud iam service-accounts keys create ./credentials/gcp-service-account.json \
    --iam-account=llm-monitor-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 2. Datadog Setup

#### Obtain API Keys

1. Log in to your Datadog account
2. Navigate to **Organization Settings** > **API Keys**
3. Create a new API key for the LLM Monitor
4. Navigate to **Organization Settings** > **Application Keys**
5. Create a new application key

#### Configure Datadog Agent (Optional)

If using Datadog Agent for additional system metrics:

```yaml
# datadog.yaml
api_key: YOUR_DATADOG_API_KEY
site: datadoghq.com  # or datadoghq.eu for EU

logs_enabled: true
process_config:
  enabled: "true"

# Enable APM
apm_config:
  enabled: true
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./credentials/gcp-service-account.json

# Datadog Configuration
DATADOG_API_KEY=your-datadog-api-key
DATADOG_APP_KEY=your-datadog-app-key
DATADOG_SITE=datadoghq.com

# Application Configuration
APP_NAME=llm-observability-monitor
APP_VERSION=1.0.0
APP_ENVIRONMENT=production

# Telemetry Configuration
TELEMETRY_BATCH_SIZE=100
TELEMETRY_FLUSH_INTERVAL=5000
TELEMETRY_MAX_RETRIES=3
TELEMETRY_RETRY_DELAY=1000

# Security Configuration
SECURITY_ENABLE_DLP=true
SECURITY_CONFIDENCE_THRESHOLD=0.8

# Cost Configuration
COST_CURRENCY=USD
```

### Configuration File

Create `config/production.json`:

```json
{
  "googleCloud": {
    "projectId": "${GOOGLE_CLOUD_PROJECT_ID}",
    "location": "${GOOGLE_CLOUD_LOCATION}",
    "credentials": "${GOOGLE_APPLICATION_CREDENTIALS}"
  },
  "datadog": {
    "apiKey": "${DATADOG_API_KEY}",
    "appKey": "${DATADOG_APP_KEY}",
    "site": "${DATADOG_SITE}"
  },
  "application": {
    "name": "${APP_NAME}",
    "version": "${APP_VERSION}",
    "environment": "${APP_ENVIRONMENT}"
  },
  "telemetry": {
    "batchSize": 100,
    "flushInterval": 5000,
    "maxRetries": 3,
    "retryDelay": 1000
  },
  "security": {
    "enableDlpScanning": true,
    "sensitiveDataTypes": [
      "PERSON_NAME",
      "EMAIL_ADDRESS",
      "PHONE_NUMBER",
      "CREDIT_CARD_NUMBER",
      "US_SOCIAL_SECURITY_NUMBER"
    ],
    "confidenceThreshold": 0.8
  },
  "cost": {
    "currency": "USD",
    "budgets": [
      {
        "id": "monthly-budget",
        "name": "Monthly LLM Budget",
        "limit": 1000.0,
        "period": "monthly",
        "alertThresholds": [50, 80, 95]
      }
    ],
    "alertThresholds": [50, 80, 95]
  }
}
```

## Deployment Options

### Option 1: Docker Deployment

#### Dockerfile

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY dist/ ./dist/
COPY config/ ./config/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js

# Start application
CMD ["node", "dist/index.js"]
```

#### Docker Compose

```yaml
version: '3.8'

services:
  llm-monitor:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - GOOGLE_CLOUD_PROJECT_ID=${GOOGLE_CLOUD_PROJECT_ID}
      - GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION}
      - GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/gcp-service-account.json
      - DATADOG_API_KEY=${DATADOG_API_KEY}
      - DATADOG_APP_KEY=${DATADOG_APP_KEY}
      - DATADOG_SITE=${DATADOG_SITE}
    volumes:
      - ./credentials:/app/credentials:ro
      - ./config:/app/config:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "dist/health-check.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Datadog Agent
  datadog-agent:
    image: gcr.io/datadoghq/agent:7
    environment:
      - DD_API_KEY=${DATADOG_API_KEY}
      - DD_SITE=${DATADOG_SITE}
      - DD_LOGS_ENABLED=true
      - DD_PROCESS_AGENT_ENABLED=true
      - DD_APM_ENABLED=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc/:/host/proc/:ro
      - /sys/fs/cgroup/:/host/sys/fs/cgroup:ro
    restart: unless-stopped
```

#### Build and Deploy

```bash
# Build the application
npm run build

# Build Docker image
docker build -t llm-observability-monitor .

# Run with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f llm-monitor
```

### Option 2: Kubernetes Deployment

#### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: llm-monitor
```

#### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: llm-monitor-config
  namespace: llm-monitor
data:
  NODE_ENV: "production"
  GOOGLE_CLOUD_LOCATION: "us-central1"
  DATADOG_SITE: "datadoghq.com"
  APP_NAME: "llm-observability-monitor"
  APP_VERSION: "1.0.0"
  APP_ENVIRONMENT: "production"
```

#### Secret

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: llm-monitor-secrets
  namespace: llm-monitor
type: Opaque
data:
  GOOGLE_CLOUD_PROJECT_ID: <base64-encoded-project-id>
  DATADOG_API_KEY: <base64-encoded-api-key>
  DATADOG_APP_KEY: <base64-encoded-app-key>
  GCP_SERVICE_ACCOUNT: <base64-encoded-service-account-json>
```

#### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-monitor
  namespace: llm-monitor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: llm-monitor
  template:
    metadata:
      labels:
        app: llm-monitor
    spec:
      containers:
      - name: llm-monitor
        image: llm-observability-monitor:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: llm-monitor-config
        - secretRef:
            name: llm-monitor-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: gcp-credentials
          mountPath: /app/credentials
          readOnly: true
      volumes:
      - name: gcp-credentials
        secret:
          secretName: llm-monitor-secrets
          items:
          - key: GCP_SERVICE_ACCOUNT
            path: gcp-service-account.json
```

#### Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: llm-monitor-service
  namespace: llm-monitor
spec:
  selector:
    app: llm-monitor
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

#### Deploy to Kubernetes

```bash
# Apply all configurations
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n llm-monitor

# Check logs
kubectl logs -f deployment/llm-monitor -n llm-monitor
```

### Option 3: Cloud Run Deployment

#### Cloud Run Configuration

```yaml
# cloudrun.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: llm-monitor
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 100
      timeoutSeconds: 300
      containers:
      - image: gcr.io/YOUR_PROJECT_ID/llm-monitor:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: GOOGLE_CLOUD_PROJECT_ID
          value: "YOUR_PROJECT_ID"
        - name: GOOGLE_CLOUD_LOCATION
          value: "us-central1"
        - name: DATADOG_API_KEY
          valueFrom:
            secretKeyRef:
              name: datadog-secrets
              key: api-key
        - name: DATADOG_APP_KEY
          valueFrom:
            secretKeyRef:
              name: datadog-secrets
              key: app-key
        resources:
          limits:
            cpu: "1"
            memory: "1Gi"
```

#### Deploy to Cloud Run

```bash
# Build and push image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/llm-monitor

# Deploy to Cloud Run
gcloud run deploy llm-monitor \
  --image gcr.io/YOUR_PROJECT_ID/llm-monitor \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10
```

## Monitoring Setup

### Health Checks

Create `src/health-check.js`:

```javascript
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET',
  timeout: 3000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => {
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();
```

### Datadog Dashboard

The application will automatically create Datadog dashboards. To manually create additional dashboards:

```bash
# Use the demo dashboard setup
npm run setup-dashboards
```

### Alerts Configuration

Key alerts to configure in Datadog:

1. **High Latency Alert**
   - Metric: `avg:llm.response.latency{*}`
   - Threshold: > 3000ms
   - Time window: 5 minutes

2. **Error Rate Alert**
   - Metric: `(sum:llm.errors.count{*} / sum:llm.requests.count{*}) * 100`
   - Threshold: > 5%
   - Time window: 5 minutes

3. **Cost Budget Alert**
   - Metric: `sum:llm.cost.total{*}`
   - Threshold: > $100/hour
   - Time window: 1 hour

## Security Considerations

### Network Security

1. **Firewall Rules**
   ```bash
   # Allow only necessary outbound traffic
   # Google Cloud APIs: 443/tcp to *.googleapis.com
   # Datadog: 443/tcp to *.datadoghq.com
   ```

2. **VPC Configuration**
   - Deploy in private subnets when possible
   - Use Cloud NAT for outbound internet access
   - Implement network security groups

### Secrets Management

1. **Google Cloud Secret Manager**
   ```bash
   # Store Datadog API key
   gcloud secrets create datadog-api-key --data-file=api-key.txt
   
   # Grant access to service account
   gcloud secrets add-iam-policy-binding datadog-api-key \
     --member="serviceAccount:llm-monitor-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

2. **Kubernetes Secrets**
   ```bash
   # Create secret from file
   kubectl create secret generic llm-monitor-secrets \
     --from-file=gcp-service-account.json \
     --from-literal=datadog-api-key=YOUR_API_KEY \
     -n llm-monitor
   ```

### Access Control

1. **Service Account Permissions**
   - Use principle of least privilege
   - Regularly audit permissions
   - Rotate service account keys

2. **API Access**
   - Implement rate limiting
   - Use API keys with restricted scopes
   - Monitor API usage

## Troubleshooting

### Common Issues

#### 1. Authentication Errors

**Symptom**: `Error: Could not load the default credentials`

**Solution**:
```bash
# Verify service account key
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
gcloud auth application-default print-access-token

# Check permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

#### 2. Datadog Connection Issues

**Symptom**: `Failed to send metrics to Datadog`

**Solution**:
```bash
# Test Datadog connectivity
curl -X POST "https://api.datadoghq.com/api/v1/validate" \
  -H "DD-API-KEY: YOUR_API_KEY"

# Check network connectivity
nslookup api.datadoghq.com
```

#### 3. High Memory Usage

**Symptom**: Application crashes with out-of-memory errors

**Solution**:
```bash
# Increase memory limits
# Docker: --memory=2g
# Kubernetes: resources.limits.memory: "2Gi"
# Node.js: --max-old-space-size=2048

# Monitor memory usage
kubectl top pods -n llm-monitor
```

#### 4. API Rate Limits

**Symptom**: `429 Too Many Requests` errors

**Solution**:
```bash
# Adjust telemetry configuration
export TELEMETRY_BATCH_SIZE=50
export TELEMETRY_FLUSH_INTERVAL=10000

# Implement exponential backoff
export TELEMETRY_MAX_RETRIES=5
export TELEMETRY_RETRY_DELAY=2000
```

### Logging and Debugging

#### Enable Debug Logging

```bash
export LOG_LEVEL=debug
export DEBUG=llm-monitor:*
```

#### View Application Logs

```bash
# Docker
docker logs llm-monitor

# Kubernetes
kubectl logs -f deployment/llm-monitor -n llm-monitor

# Cloud Run
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=llm-monitor"
```

### Performance Tuning

#### Node.js Optimization

```bash
# Increase heap size
export NODE_OPTIONS="--max-old-space-size=2048"

# Enable garbage collection logging
export NODE_OPTIONS="--trace-gc --trace-gc-verbose"
```

#### Scaling Configuration

```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: llm-monitor-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: llm-monitor
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Support and Maintenance

### Regular Maintenance Tasks

1. **Update Dependencies**
   ```bash
   npm audit
   npm update
   ```

2. **Rotate Credentials**
   ```bash
   # Rotate service account keys quarterly
   gcloud iam service-accounts keys create new-key.json \
     --iam-account=llm-monitor-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

3. **Monitor Resource Usage**
   ```bash
   # Check Datadog usage
   # Monitor Google Cloud quotas
   # Review cost reports
   ```

### Backup and Recovery

1. **Configuration Backup**
   ```bash
   # Backup configuration files
   tar -czf config-backup-$(date +%Y%m%d).tar.gz config/ credentials/
   ```

2. **Dashboard Backup**
   ```bash
   # Export Datadog dashboards
   npm run export-dashboards
   ```

For additional support, refer to the project documentation or contact the development team.