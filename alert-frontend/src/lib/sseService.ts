// import type { GraylogAlert } from '@/types/alerts';

// const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// class SSEService {
//   private eventSource: EventSource | null = null;
//   private isConnected = false;
//   private reconnectAttempts = 0;
//   private maxReconnectAttempts = 5;
//   private reconnectDelay = 1000; // Start with 1 second

//   // Event handlers
//   private onAlertHandlers: ((alert: GraylogAlert) => void)[] = [];
//   private onAlertsHandlers: ((alerts: GraylogAlert[]) => void)[] = [];
//   private onAlertUpdateHandlers: ((alert: GraylogAlert) => void)[] = [];
//   private onConnectionHandlers: ((connected: boolean) => void)[] = [];

//   connect() {
//     if (this.eventSource && this.isConnected) {
//       console.log('🔌 SSE already connected');
//       return;
//     }

//     console.log('🔌 Connecting to SSE...');
//     this.eventSource = new EventSource(`${API_BASE_URL}/graylog-sse`);

//     this.eventSource.onopen = () => {
//       console.log('✅ SSE connected');
//       this.isConnected = true;
//       this.reconnectAttempts = 0;
//       this.reconnectDelay = 1000;
//       this.notifyConnectionHandlers(true);
//     };

//     this.eventSource.onerror = (error) => {
//       console.error('❌ SSE connection error:', error);
//       this.isConnected = false;
//       this.notifyConnectionHandlers(false);
//       this.handleReconnect();
//     };

//     this.eventSource.onmessage = (event) => {
//       try {
//         const data = JSON.parse(event.data);
        
//         switch (data.type) {
//           case 'alert':
//             console.log('📨 Received new Graylog alert via SSE:', data.data);
//             this.notifyAlertHandlers(data.data);
//             break;
//           case 'alerts':
//             console.log('📨 Received Graylog alerts batch via SSE:', data.data.length);
//             this.notifyAlertsHandlers(data.data);
//             break;
//           case 'alert-updated':
//             console.log('🔄 Received Graylog alert update via SSE:', data.data);
//             this.notifyAlertUpdateHandlers(data.data);
//             break;
//           case 'ping':
//             // Keep-alive ping, no action needed
//             break;
//           default:
//             console.log('📨 Unknown SSE message type:', data.type);
//         }
//       } catch (error) {
//         console.error('❌ Error parsing SSE message:', error);
//       }
//     };
//   }

//   private handleReconnect() {
//     if (this.reconnectAttempts >= this.maxReconnectAttempts) {
//       console.log('❌ Max reconnection attempts reached');
//       return;
//     }

//     this.reconnectAttempts++;
//     const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
//     console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
//     setTimeout(() => {
//       if (!this.isConnected) {
//         this.connect();
//       }
//     }, delay);
//   }

//   disconnect() {
//     if (this.eventSource) {
//       console.log('🔌 Disconnecting SSE...');
//       this.eventSource.close();
//       this.eventSource = null;
//       this.isConnected = false;
//       this.notifyConnectionHandlers(false);
//     }
//   }

//   // Event subscription methods
//   onAlert(handler: (alert: GraylogAlert) => void) {
//     this.onAlertHandlers.push(handler);
//     return () => {
//       const index = this.onAlertHandlers.indexOf(handler);
//       if (index > -1) {
//         this.onAlertHandlers.splice(index, 1);
//       }
//     };
//   }

//   onAlerts(handler: (alerts: GraylogAlert[]) => void) {
//     this.onAlertsHandlers.push(handler);
//     return () => {
//       const index = this.onAlertsHandlers.indexOf(handler);
//       if (index > -1) {
//         this.onAlertsHandlers.splice(index, 1);
//       }
//     };
//   }

//   onAlertUpdate(handler: (alert: GraylogAlert) => void) {
//     this.onAlertUpdateHandlers.push(handler);
//     return () => {
//       const index = this.onAlertUpdateHandlers.indexOf(handler);
//       if (index > -1) {
//         this.onAlertUpdateHandlers.splice(index, 1);
//       }
//     };
//   }

//   onConnection(handler: (connected: boolean) => void) {
//     this.onConnectionHandlers.push(handler);
//     return () => {
//       const index = this.onConnectionHandlers.indexOf(handler);
//       if (index > -1) {
//         this.onConnectionHandlers.splice(index, 1);
//       }
//     };
//   }

//   // Notify methods
//   private notifyAlertHandlers(alert: GraylogAlert) {
//     this.onAlertHandlers.forEach(handler => handler(alert));
//   }

//   private notifyAlertsHandlers(alerts: GraylogAlert[]) {
//     this.onAlertsHandlers.forEach(handler => handler(alerts));
//   }

//   private notifyAlertUpdateHandlers(alert: GraylogAlert) {
//     this.onAlertUpdateHandlers.forEach(handler => handler(alert));
//   }

//   private notifyConnectionHandlers(connected: boolean) {
//     this.onConnectionHandlers.forEach(handler => handler(connected));
//   }

//   // Getters
//   get connected() {
//     return this.isConnected;
//   }

//   get readyState() {
//     return this.eventSource?.readyState;
//   }
// }

// // Export singleton instance
// export const sseService = new SSEService();
