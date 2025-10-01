import type { OCIAlert } from '@/types/alerts';

class SSEService {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private onAlertCallback: ((alert: OCIAlert) => void) | null = null;
  private onConnectionChangeCallback: ((connected: boolean) => void) | null = null;

  constructor() {
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  connect(apiBaseUrl: string) {
    if (this.eventSource) {
      this.disconnect();
    }

    const streamUrl = `${apiBaseUrl}/webhook/stream`;
    console.log('🔌 [SSE] Connecting to:', streamUrl);

    try {
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.onopen = () => {
        console.log('✅ [SSE] Connected to alert stream');
        this.reconnectAttempts = 0;
        this.onConnectionChangeCallback?.(true);
      };

      this.eventSource.onmessage = this.handleMessage;

      this.eventSource.onerror = (event) => {
        console.error('❌ [SSE] Connection error:', event);
        this.onConnectionChangeCallback?.(false);
        this.handleError(event);
      };

      // Handle different event types
      this.eventSource.addEventListener('alert', this.handleMessage);
      this.eventSource.addEventListener('connected', this.handleMessage);
      this.eventSource.addEventListener('heartbeat', this.handleMessage);
    } catch (error) {
      console.error('❌ [SSE] Failed to create EventSource:', error);
      this.onConnectionChangeCallback?.(false);
    }
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'alert':
          console.log('🔔 [SSE] Received alert:', data.data);
          this.onAlertCallback?.(data.data);
          break;
        case 'connected':
          console.log('✅ [SSE] Stream connected:', data.message);
          break;
        case 'heartbeat':
          console.log('💓 [SSE] Heartbeat received');
          break;
        default:
          console.log('📨 [SSE] Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('❌ [SSE] Error parsing message:', error);
    }
  }

  private handleError(event: Event) {
    console.error('❌ [SSE] Connection error:', event);
    this.onConnectionChangeCallback?.(false);

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`🔄 [SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.connect(this.getCurrentUrl());
        }
      }, delay);
    } else {
      console.error('❌ [SSE] Max reconnection attempts reached');
    }
  }

  private getCurrentUrl(): string {
    // Extract base URL from current connection
    if (this.eventSource?.url) {
      return this.eventSource.url.replace('/webhook/stream', '');
    }
    return import.meta.env.VITE_API_URL || '';
  }

  disconnect() {
    if (this.eventSource) {
      console.log('🔌 [SSE] Disconnecting from alert stream');
      this.eventSource.close();
      this.eventSource = null;
      this.onConnectionChangeCallback?.(false);
    }
  }

  onAlert(callback: (alert: OCIAlert) => void) {
    this.onAlertCallback = callback;
  }

  onConnectionChange(callback: (connected: boolean) => void) {
    this.onConnectionChangeCallback = callback;
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  getConnectionState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED;
  }
}

// Export singleton instance
export const sseService = new SSEService();