import express from "express";
import authRoutes from "./routes/auth";
import conversationRoutes from "./routes/conversation";
import messageRoutes from "./routes/message";

const app = express();
app.use(express.json());

// Register routes
app.use("/auth", authRoutes);
app.use("/conversations", conversationRoutes);
app.use("/", messageRoutes); // Message routes already have /conversations prefix

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
