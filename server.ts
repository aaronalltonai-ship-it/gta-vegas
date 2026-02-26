import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Player state
  const players: Record<string, { id: string; lat: number; lng: number; name: string; color: string; icon?: string }> = {};

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Initialize player
    players[socket.id] = {
      id: socket.id,
      lat: 36.1126, // Bellagio Fountains
      lng: -115.1767,
      name: `Player ${socket.id.slice(0, 4)}`,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
      icon: 'default'
    };

    // Send current players to the new user
    socket.emit("init", Object.values(players));

    // Broadcast new player to others
    socket.broadcast.emit("playerJoined", players[socket.id]);

    socket.on("updateProfile", (data: { name: string; icon: string }) => {
      if (players[socket.id]) {
        players[socket.id].name = data.name;
        players[socket.id].icon = data.icon;
        io.emit("playerUpdated", players[socket.id]);
      }
    });

    socket.on("move", (data: { lat: number; lng: number }) => {
      if (players[socket.id]) {
        players[socket.id].lat = data.lat;
        players[socket.id].lng = data.lng;
        socket.broadcast.emit("playerMoved", players[socket.id]);
      }
    });

    socket.on("chat", (message: string) => {
      if (players[socket.id]) {
        io.emit("chatMessage", {
          id: socket.id,
          name: players[socket.id].name,
          message: message,
          color: players[socket.id].color,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      delete players[socket.id];
      io.emit("playerLeft", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
