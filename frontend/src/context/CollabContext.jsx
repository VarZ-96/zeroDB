import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";
import { useAuth } from "./AuthContext";
import api from "../services/api";

const CollabContext = createContext();

export const CollabProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [collaborators, setCollaborators] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState(new Map());
  const [peerExecuting, setPeerExecuting] = useState({ isExecuting: false, name: "" });
  const [pendingInvites, setPendingInvites] = useState([]);
  const [collabDbName, setCollabDbName] = useState("");

  const databaseContextRef = useRef(null);
  const editorRef = useRef(null);
  const latestBroadcastRef = useRef(null);

  // Connect to socket when user logs in
  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setActiveRoomId("");
      setCollaborators([]);
      setRemoteCursors(new Map());
      return;
    }

    const socketUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
    const newSocket = io(socketUrl, {
      transports: ["websocket"]
    });
    
    newSocket.on("connect", () => {
      console.log("🔌 Connected to zeroDB Socket Server");
      newSocket.emit("register-user", user._id);
    });

    newSocket.on("disconnect", () => {
      console.log("🔌 Disconnected from Socket Server");
    });

    // Handle invitation toaster
    newSocket.on("new-invitation", (invite) => {
      setPendingInvites((prev) => {
        // Prevent duplicate notices
        if (prev.some((p) => p._id === invite._id)) return prev;
        return [invite, ...prev];
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Bind to DatabaseContext at runtime
  const registerDatabaseContext = useCallback((dbCtx) => {
    databaseContextRef.current = dbCtx;
    if (dbCtx && dbCtx.registerQueryListener) {
      dbCtx.registerQueryListener((sql, isReplicated) => {
        if (!isReplicated && latestBroadcastRef.current) {
          latestBroadcastRef.current(sql);
        }
      });
    }
  }, []);

  // Bind to Monaco Editor instance
  const registerEditorInstance = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  // Fetch pending invites
  const fetchPendingInvites = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get("/collab/invitations");
      if (res.data.success) {
        setPendingInvites(res.data.invitations);
      }
    } catch (err) {
      console.warn("Failed to fetch pending invites", err);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchPendingInvites();
  }, [user, fetchPendingInvites]);

  // Handle invitation responses
  const respondToInvite = useCallback(async (invitationId, status) => {
    try {
      const res = await api.post("/collab/respond", { invitationId, status });
      if (res.data.success) {
        setPendingInvites((prev) => prev.filter((inv) => inv._id !== invitationId));
        return res.data;
      }
    } catch (err) {
      console.error("Failed to respond to invite", err);
      throw new Error(err.response?.data?.error || "Failed to respond");
    }
  }, []);

  // Room Listener Configuration via Effect
  useEffect(() => {
    if (!socket || !activeRoomId) {
      setCollaborators([]);
      setRemoteCursors(new Map());
      setPeerExecuting({ isExecuting: false, name: "" });
      return;
    }

    const handlePresenceUpdate = (users) => {
      console.log("👥 Socket Presence Update:", users);
      setCollaborators(users.filter((u) => u._id?.toString() !== user?._id?.toString()));
    };

    const handlePeerJoined = (peer) => {
      console.log(`👋 Peer joined: ${peer.name}`);
    };

    const handlePeerLeft = (peer) => {
      console.log(`👋 Peer left: ${peer.name}`);
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        if (peer && peer._id) next.delete(peer._id.toString());
        return next;
      });
    };

    const handleTextChange = ({ text }) => {
      if (databaseContextRef.current) {
        if (databaseContextRef.current.query !== text) {
          databaseContextRef.current.setQuery(text);
        }
      }
    };

    const handleCursorMove = ({ cursor, user: peer }) => {
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        if (peer && peer._id) {
          next.set(peer._id.toString(), { cursor, user: peer });
        }
        return next;
      });
    };

    const handleQueryExecute = ({ sql, user: peer }) => {
      console.log(`⚡ Replicating query from ${peer.name}: ${sql}`);
      if (databaseContextRef.current) {
        if (databaseContextRef.current.executionMode !== "production") {
          databaseContextRef.current.executeSql(sql, true);
        }
      }
    };

    const handleQueryExecuting = ({ isExecuting, user: peer }) => {
      setPeerExecuting({ isExecuting, name: peer.name });
    };

    socket.on("presence-update", handlePresenceUpdate);
    socket.on("peer-joined", handlePeerJoined);
    socket.on("peer-left", handlePeerLeft);
    socket.on("text-change", handleTextChange);
    socket.on("cursor-move", handleCursorMove);
    socket.on("query-execute", handleQueryExecute);
    socket.on("query-executing", handleQueryExecuting);

    return () => {
      socket.off("presence-update", handlePresenceUpdate);
      socket.off("peer-joined", handlePeerJoined);
      socket.off("peer-left", handlePeerLeft);
      socket.off("text-change", handleTextChange);
      socket.off("cursor-move", handleCursorMove);
      socket.off("query-execute", handleQueryExecute);
      socket.off("query-executing", handleQueryExecuting);
    };
  }, [socket, activeRoomId, user]);

  // Spawn Collaboration Room ("Go Live")
  const startCollabSession = useCallback(async () => {
    if (!socket || !user || !databaseContextRef.current) return;

    try {
      const mode = databaseContextRef.current.executionMode;
      const dbName = databaseContextRef.current.activeDb || "test.sqlite";
      setCollabDbName(dbName);
      let shareId = "postgres-prod-dummy"; // PostgreSQL mode doesn't need file sharing

      // 1. In Draft mode, export and share the current SQLite database binary
      if (mode === "draft") {
        console.log("📤 Exporting database state for peer seeding...");
        const response = await databaseContextRef.current.exportAndShareDatabase("private");
        shareId = response.shareId;
        console.log(`📤 Database shared successfully! ShareId: ${shareId}`);
      }

      // 2. Build Room ID
      const roomId = `room-${user._id}-${Date.now().toString(36)}`;
      setActiveRoomId(roomId);

      // 3. Connect to WebSocket room
      socket.emit("join-room", { roomId, user });

      // 4. Update window location with query params so invite links can be copied manually
      const params = new URLSearchParams(window.location.search);
      params.set("room", roomId);
      params.set("importDb", shareId);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

      return { roomId, shareId };
    } catch (err) {
      console.error("Failed to spin up collaboration room", err);
      throw err;
    }
  }, [socket, user]);

  // Join Existing Collaboration Room
  const joinCollabSession = useCallback(async (roomId, shareId) => {
    if (!socket || !user || !databaseContextRef.current) return;

    try {
      const mode = databaseContextRef.current.executionMode;
      
      // 1. In Draft mode, download and boot the host's exact database snapshot first
      if (mode === "draft" && shareId && shareId !== "postgres-prod-dummy") {
        console.log(`📥 Downloading and seeding database snapshot: ${shareId}`);
        await databaseContextRef.current.importSharedDatabase(shareId);
        console.log("📥 Database snapshot booted successfully!");
      }

      // 2. Connect to WebSocket room
      setActiveRoomId(roomId);
      socket.emit("join-room", { roomId, user });

      // 3. Sync URL params
      const params = new URLSearchParams(window.location.search);
      params.set("room", roomId);
      params.set("importDb", shareId);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

      setCollabDbName(databaseContextRef.current.activeDb || "imported.sqlite");
    } catch (err) {
      console.error("Failed to join collaboration room", err);
      throw err;
    }
  }, [socket, user]);

  // Leave Collaboration Room (Fork on Disconnect)
  const leaveCollabSession = useCallback(async () => {
    if (!socket || !databaseContextRef.current) return;

    const mode = databaseContextRef.current.executionMode;

    // 1. SQLite Draft Mode Exclusive: Save database clone copy
    if (mode === "draft" && activeRoomId) {
      const saveCopy = window.confirm(
        "You are leaving the collaborative session. Would you like to save a copy of this database to edit independently?"
      );

      if (saveCopy) {
        const defaultName = `collab_copy_${Date.now().toString(36)}`;
        const customName = window.prompt("Enter a name for your local database copy:", defaultName);
        
        if (customName && customName.trim() !== "") {
          try {
            const cleanDbName = customName.trim().replace(/\.sqlite$/i, "") + ".sqlite";
            console.log(`💾 Cloning active collaborative DB to: ${cleanDbName}`);
            
            // Save current collaborative bytes under the new name
            databaseContextRef.current.saveActiveDbAs(cleanDbName);
            
            alert(`Database copy successfully saved as "${cleanDbName}"!`);
          } catch (err) {
            console.error("Failed to save database copy:", err);
            alert("Failed to save database copy: " + err.message);
          }
        }
      }
    }

    // 2. Disconnect socket room
    socket.emit("leave-room", { roomId: activeRoomId, user });
    
    // Reset state
    setActiveRoomId("");
    setCollaborators([]);
    setRemoteCursors(new Map());
    setPeerExecuting({ isExecuting: false, name: "" });

    // Wipe out room parameters from URL query string
    window.history.replaceState({}, "", window.location.pathname);
  }, [socket, activeRoomId, user]);

  // Broadcast code typing updates
  const broadcastTextChange = useCallback((text) => {
    if (socket && activeRoomId) {
      socket.emit("text-change", { roomId: activeRoomId, text });
    }
  }, [socket, activeRoomId]);

  // Broadcast cursor movements
  const broadcastCursorMove = useCallback((cursor) => {
    if (socket && activeRoomId) {
      socket.emit("cursor-move", { roomId: activeRoomId, cursor, user });
    }
  }, [socket, activeRoomId, user]);

  // Broadcast query execution actions
  const broadcastQueryExecute = useCallback((sql) => {
    if (socket && activeRoomId) {
      socket.emit("query-execute", { roomId: activeRoomId, sql, user });
    }
  }, [socket, activeRoomId, user]);

  useEffect(() => {
    latestBroadcastRef.current = broadcastQueryExecute;
  }, [broadcastQueryExecute]);

  // Broadcast loader spinner state
  const broadcastQueryExecuting = useCallback((isExecuting) => {
    if (socket && activeRoomId) {
      socket.emit("query-executing", { roomId: activeRoomId, isExecuting, user });
    }
  }, [socket, activeRoomId, user]);

  // Send Direct Email Invite
  const sendEmailInvite = useCallback(async (email, roomId, shareId) => {
    try {
      const mode = databaseContextRef.current?.executionMode || "draft";
      const dbName = databaseContextRef.current?.activeDb || "test.sqlite";

      const res = await api.post("/collab/invite", {
        email,
        roomId,
        dbName,
        shareId,
      });

      return res.data;
    } catch (err) {
      console.error("Failed to send invite", err);
      throw new Error(err.response?.data?.error || "Failed to send invitation.");
    }
  }, []);

  return (
    <CollabContext.Provider
      value={{
        socket,
        activeRoomId,
        collaborators,
        remoteCursors,
        peerExecuting,
        pendingInvites,
        collabDbName,
        setCollabDbName,
        registerDatabaseContext,
        registerEditorInstance,
        startCollabSession,
        joinCollabSession,
        leaveCollabSession,
        broadcastTextChange,
        broadcastCursorMove,
        broadcastQueryExecute,
        broadcastQueryExecuting,
        sendEmailInvite,
        respondToInvite,
        fetchPendingInvites,
      }}
    >
      {children}
    </CollabContext.Provider>
  );
};

export const useCollab = () => {
  const context = useContext(CollabContext);
  if (!context) {
    throw new Error("useCollab must be used within a CollabProvider");
  }
  return context;
};
