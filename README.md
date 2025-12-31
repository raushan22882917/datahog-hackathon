# LLM Observability Monitor - Datahog Hackathon

An innovative end-to-end monitoring solution that tracks the health, performance, and security of Large Language Model applications powered by Google Cloud's Vertex AI or Gemini. The system streams comprehensive telemetry data to Datadog, implements intelligent detection rules, and provides actionable insights through dashboards and automated incident management.

## Features

- **Real-time Performance Monitoring**: Track response times, token usage, and model performance metrics
- **Intelligent Detection Rules**: Automated anomaly detection and threshold-based alerting
- **Security Analysis**: Prompt injection detection, harmful content analysis, and sensitive data scanning
- **Cost Optimization**: Real-time cost tracking, budget monitoring, and optimization recommendations
- **Datadog Integration**: Comprehensive dashboards, incident management, and alerting
- **Auto-instrumentation**: Minimal configuration setup with automatic LLM application discovery

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Google Cloud Project with Vertex AI or Gemini API enabled
- Datadog account with API and App keys
- Service account credentials for Google Cloud (optional, can use default credentials)

### Installation

```bash
npm install
```

### Configuration

The system supports both real implementations using Google Cloud services and mock implementations for development/testing.

#### Real Implementation Setup

1. **Copy environment template:**
```bash
cp .env.example .env
```

2. **Configure real services in `.env`:**
```bash
# Google Cloud Configuration (REQUIRED)
GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./path/to/service-account-key.json

# Datadog Configuration (REQUIRED)
DATADOG_API_KEY=your-actual-datadog-api-key
DATADOG_APP_KEY=your-actual-datadog-app-key
DATADOG_SITE=datadoghq.com

# Enable real implementations
USE_REAL_VERTEX_AI=true
USE_REAL_DATADOG=true
USE_REAL_DLP=true

# Application Configuration
APP_NAME=my-llm-app
APP_VERSION=1.0.0
APP_ENVIRONMENT=production
```

3. **Set up Google Cloud credentials:**
   - Create a service account in Google Cloud Console
   - Enable Vertex AI API and Cloud DLP API
   - Download the service account key JSON file
   - Place it in the `config/` directory (e.g., `config/your-service-account.json`)
   - Set the path in `GOOGLE_APPLICATION_CREDENTIALS` environment variable
   - **Note**: Never commit credential files to version control. Use the provided `config/service-account-example.json` as a template.

4. **Set up Datadog:**
   - Get API and App keys from Datadog dashboard
   - Set appropriate site (datadoghq.com, datadoghq.eu, etc.)

#### Development/Mock Setup

For development or testing without real services:

```bash
# Use mock implementations (default for development)
USE_REAL_VERTEX_AI=false
USE_REAL_DATADOG=false
USE_REAL_DLP=false

# Enable fallback to mocks if real services fail
ENABLE_MOCK_FALLBACK=true
ENABLE_VERBOSE_LOGGING=true
```

#### Programmatic Configuration

```typescript
import { loadConfig } from 'llm-observability-monitor';

const config = loadConfig({
  googleCloud: {
    projectId: 'your-project-id',
    location: 'us-central1'
  },
  datadog: {
    apiKey: 'your-datadog-api-key',
    appKey: 'your-datadog-app-key'
  },
  application: {
    name: 'my-llm-app',
    version: '1.0.0',
    environment: 'production'
  }
});
```

### Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build the project
npm run build

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## Project Structure

```
src/
├── config/           # Configuration management with Joi validation
├── interfaces/       # Core component interfaces
├── types/           # TypeScript type definitions
├── test/            # Test setup and utilities
└── index.ts         # Main entry point
```

## Core Components

### Real vs Mock Implementations

The system now supports both real implementations using actual Google Cloud services and mock implementations for development:

#### Real Implementations
- **Vertex AI Integration**: Uses `@google-cloud/vertexai` for actual LLM calls
- **Google Cloud DLP**: Real sensitive data detection using Cloud DLP API
- **Datadog Integration**: Real dashboard creation and metric streaming
- **Real-time Pricing**: Actual Vertex AI pricing calculations (updated December 2024)

#### Mock Implementations (Fallback)
- Pattern-based sensitive data detection
- Simulated telemetry generation
- Local dashboard configurations
- Estimated pricing calculations

### Configuration System
- Environment variable support with real/mock flags
- Joi schema validation
- Default configurations for different environments
- Type-safe configuration loading
- Automatic fallback to mock implementations

### Security Features
- **Real Google Cloud DLP**: Production-grade sensitive data detection
- **Prompt Injection Detection**: Advanced pattern matching for security threats
- **Compliance Monitoring**: GDPR, HIPAA, PCI DSS, SOX violation detection
- **Content Analysis**: Harmful content and bias detection

### Cost Management
- **Real-time Pricing**: Current Vertex AI pricing (Gemini 1.5 Pro/Flash, etc.)
- **Budget Tracking**: Automated cost monitoring and alerts
- **Model Comparison**: Cost analysis across different models
- **Optimization Recommendations**: AI-driven cost reduction suggestions

## Testing

The project uses Jest for unit testing and fast-check for property-based testing:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- config.test.ts
```

## License

MIT License - see LICENSE file for details.
