// API service for connecting frontend to Cosmos backend (optional)
const API_BASE_URL = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '';

export interface VideoAnalysisRequest {
  prompt: string;
  systemPrompt?: string;
  videoFile?: File;
}

export interface AnalysisResponse {
  reasoning: string[];
  answer: string;
  confidence: number;
  timestamp: string;
  actor: string;
  events?: EventData[];
  summary?: Record<string, unknown>;
}

export interface EventData {
  event_type: string;
  start_time: string;
  end_time: string;
  player_jersey: string;
  team: string;
  jersey_color: string;
  description?: string;
  assist_player?: string;
  goal_type?: string;
  outcome?: string;
  goalkeeper_jersey?: string;
  goalkeeper_team?: string;
  goalkeeper_color?: string;
  reason?: string;
  referee_action?: string;
  foul_type?: string;
}

class CosmosAPIService {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  // Get detailed health status (resilient, no-throw)
  async getHealthStatus(): Promise<{
    status: string;
    model_loaded: boolean;
    device: string;
    model_name: string;
  }> {
    try {
      if (!this.baseURL) {
        return { status: 'offline', model_loaded: false, device: 'none', model_name: 'none' };
      }
      const response = await fetch(`${this.baseURL}/health`);
      const data = await response.json();
      return {
        status: data.status,
        model_loaded: data.nim_ready,
        device: 'nvidia_nim',
        model_name: data.model
      };
    } catch {
      return { status: 'offline', model_loaded: false, device: 'none', model_name: 'none' };
    }
  }

  // Analyze video with file upload
  async analyzeVideo(request: VideoAnalysisRequest): Promise<AnalysisResponse> {
    try {
      if (!this.baseURL) {
        throw new Error('Backend is disabled');
      }
      const formData = new FormData();
      formData.append('prompt', request.prompt);
      
      if (request.systemPrompt) {
        formData.append('system_prompt', request.systemPrompt);
      }
      
      if (request.videoFile) {
        formData.append('file', request.videoFile);
      }

      const response = await fetch(`${this.baseURL}/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Analysis failed');
      }

      return await response.json();
    } catch {
      throw new Error('Backend not available');
    }
  }

  // Check if backend is ready
  async isReady(): Promise<boolean> {
    const health = await this.getHealthStatus();
    return health.status === 'healthy' && health.model_loaded;
  }
}

// Export singleton instance
export const cosmosAPI = new CosmosAPIService();

// Export class for custom instances
export default CosmosAPIService;
