import { WebSocket, Server } from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';

export class WebSocketService {
  private static instance: WebSocketService;
  private wss: Server | null = null;
  private clients: Map<string, WebSocket> = new Map(); // clientId -> socket

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Initializes the WebSocket Server attached to the HTTP server
   */
  public init(server: HttpServer): void {
    this.wss = new Server({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        this.wss?.emit('connection', ws, request);
      });
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const clientId = url.searchParams.get('clientId') || Math.random().toString(36).substring(7);
      
      this.clients.set(clientId, ws);
      console.log(`[WS]: Client connected: ${clientId}`);

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[WS]: Client disconnected: ${clientId}`);
      });

      ws.on('error', (err) => {
        console.error(`[WS]: Error for client ${clientId}:`, err);
      });
      
      // Send connection acknowledgement
      ws.send(JSON.stringify({ type: 'connected', clientId }));
    });
  }

  /**
   * Broadcasts job progress to all active clients or a specific client
   */
  public sendProgress(jobId: string, progress: number, stage: string, data?: any): void {
    const message = JSON.stringify({
      type: 'progress',
      jobId,
      progress,
      stage,
      data,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}
