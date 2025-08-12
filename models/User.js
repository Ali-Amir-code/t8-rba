import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["Admin", "Editor", "Viewer"], default: "Viewer" },
  emailVerified: { type: Boolean, default: false },
  lastLoginAt: { type: Date },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
