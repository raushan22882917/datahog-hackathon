import { v4 as uuidv4 } from 'uuid';
import { 
  InstrumentationAgent, 
  MonitoringConfig, 
  LLMRequest, 
  LLMResponse, 
  LLMError 
} from '../interfaces';
import { TelemetryEvent } from '../types';

/**
 * InstrumentationAgent implementation that intercepts Google Cloud AI API calls
 * and generates structured telemetry events with comprehensive metadata.
 */
export class GoogleCloudInstrumentationAgent implements InstrumentationAgent {
  private config: MonitoringConfig | null = null;
  private isInitialized = false;

  /**
   * Initialize the instrumentation agent with monitoring configuration
   */
  async initialize(config: MonitoringConfig): Promise<void> {
    this.config = config;
    this.isInitialized = true;
  }

  /**
   * Capture telemetry data from an LLM request
   */
  captureRequest(request: LLMRequest): TelemetryEvent {
    this.ensureInitialized();
    
    const traceId = uuidv4();
    const spanId = uuidv4();
    
    return {
      id: uuidv4(),
      timestamp: request.timestamp,
      type: 'request',
      source: this.getSourceFromModel(request.model),
      request: {
        model: request.model,
        prompt: request.prompt,
        parameters: request.parameters,
        ...(request.userId !== undefined && { userId: request.userId }),
        ...(request.sessionId !== undefined && { sessionId: request.sessionId })
      },
      metadata: {
        environment: this.config!.application.environment,
        version: this.config!.application.version,
        service: this.config!.application.name,
        traceId,
        spanId
      }
    };
  }

  /**
   * Capture telemetry data from an LLM response
   */
  captureResponse(response: LLMResponse): TelemetryEvent {
    this.ensureInitialized();
    
    const traceId = uuidv4();
    const spanId = uuidv4();
    
    return {
      id: uuidv4(),
      timestamp: response.timestamp,
      type: 'response',
      source: 'vertex-ai', // Default, could be enhanced to detect from response
      response: {
        content: response.content,
        tokenUsage: response.tokenUsage,
        latency: response.latency,
        cost: response.cost
      },
      metadata: {
        environment: this.config!.application.environment,
        version: this.config!.application.version,
        service: this.config!.application.name,
        traceId,
        spanId
      }
    };
  }

  /**
   * Capture telemetry data from an LLM error
   */
  captureError(error: LLMError): TelemetryEvent {
    this.ensureInitialized();
    
    const traceId = uuidv4();
    const spanId = uuidv4();
    
    return {
      id: uuidv4(),
      timestamp: error.timestamp,
      type: 'error',
      source: 'vertex-ai', // Default, could be enhanced to detect from error context
      error: {
        code: error.code,
        message: error.message,
        ...(error.stack !== undefined && { stack: error.stack })
      },
      metadata: {
        environment: this.config!.application.environment,
        version: this.config!.application.version,
        service: this.config!.application.name,
        traceId,
        spanId
      }
    };
  }

  /**
   * Shutdown the instrumentation agent and clean up resources
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.config = null;
  }

  /**
   * Determine the source system based on the model name
   */
  private getSourceFromModel(model: string): 'vertex-ai' | 'gemini' | 'application' {
    if (model.toLowerCase().includes('gemini')) {
      return 'gemini';
    }
    if (model.toLowerCase().includes('vertex') || model.toLowerCase().includes('bison') || model.toLowerCase().includes('chat-bison')) {
      return 'vertex-ai';
    }
    return 'application';
  }

  /**
   * Ensure the agent is properly initialized before use
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.config) {
      throw new Error('InstrumentationAgent must be initialized before use');
    }
  }
}