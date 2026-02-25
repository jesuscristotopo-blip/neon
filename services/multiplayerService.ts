import { io, Socket } from "socket.io-client";

class MultiplayerService {
    private socket: Socket | null = null;
    private initialized = false;
    private callbacks: Record<string, Function[]> = {};

    public get socketId() {
        return this.socket?.id;
    }

    public init() {
        if (this.initialized) return;

        // Connect to the same origin
        this.socket = io(window.location.origin);

        this.socket.on("connect", () => {
            console.log("Connected to multiplayer server:", this.socket?.id);
            this.trigger("connected", this.socket?.id);
        });

        this.socket.on("roomsList", (rooms) => this.trigger("roomsList", rooms));
        this.socket.on("roomUpdated", (room) => this.trigger("roomUpdated", room));
        this.socket.on("gameStarted", (room) => this.trigger("gameStarted", room));
        this.socket.on("playerMoved", (player) => this.trigger("playerMoved", player));
        this.socket.on("playerShot", (data) => this.trigger("playerShot", data));

        this.initialized = true;
    }

    public on(event: string, callback: Function) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(callback);
    }

    public off(event: string, callback: Function) {
        if (!this.callbacks[event]) return;
        this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
    }

    private trigger(event: string, data: any) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(data));
        }
    }

    public createRoom(data: any, callback: (res: any) => void) {
        if (this.socket && this.socket.connected) {
            this.socket.emit("createRoom", data, callback);
        }
    }

    public joinRoom(data: any, callback: (res: any) => void) {
        if (this.socket && this.socket.connected) {
            this.socket.emit("joinRoom", data, callback);
        }
    }

    public leaveRoom() {
        if (this.socket && this.socket.connected) {
            this.socket.emit("leaveRoom");
        }
    }

    public getRooms(callback: (rooms: any[]) => void) {
        if (this.socket && this.socket.connected) {
            this.socket.emit("getRooms", callback);
        }
    }

    public toggleReady() {
        if (this.socket && this.socket.connected) {
            this.socket.emit("toggleReady");
        }
    }

    public startGame() {
        if (this.socket && this.socket.connected) {
            this.socket.emit("startGame");
        }
    }

    public updatePosition(data: any) {
        if (this.socket && this.socket.connected) {
            this.socket.emit("updatePosition", data);
        }
    }

    public shoot(data: any) {
        if (this.socket && this.socket.connected) {
            this.socket.emit("shoot", data);
        }
    }

    public disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.initialized = false;
        }
    }
}

export const multiplayerService = new MultiplayerService();
