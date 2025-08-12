import User from "../models/User.js";
import Token from "../models/Token.js";
import { genRandomToken, hashToken } from "../utils/tokens.js";
import { sendEmail } from "../utils/email.js";

export async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;

    if (email && email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists) return res.status(400).json({ message: "Email already in use" });

      user.email = email;
      user.emailVerified = false;

      // send verification email
      const rawToken = genRandomToken();
      const tokenHash = hashToken(rawToken);
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);
      await Token.create({ user: user._id, tokenHash, type: "verify", expiresAt: expires });

      const verifyUrl = `${process.env.BASE_URL}/api/auth/verify-email?token=${rawToken}&email=${encodeURIComponent(email)}`;
      await sendEmail({
        to: email,
        subject: "Verify your new email",
        text: `Please verify your new email: ${verifyUrl}`,
        html: `<p>Please verify your email by clicking <a href="${verifyUrl}">here</a></p>`
      });
    }

    await user.save();
    res.json({ message: "Profile updated" });
  } catch (err) {
    next(err);
  }
}
