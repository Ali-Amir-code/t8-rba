import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

let transporter = null;

// Initialize transporter with SMTP settings
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    console.error("Error: SMTP_HOST or SMTP_USER environment variables are not set.");
  }
} catch (err) {
  console.error("Error initializing transporter:", err);
}

// Function to send email
export async function sendEmail({ to, subject, html, text }) {
  if (!transporter) {
    console.error("Error: Transporter is not initialized.");
    return;
  }

  try {
    // Debugging test: Verify email settings
    console.log("Email settings:");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Text:", text);
    console.log("HTML:", html);

    // Send email using transporter
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text,
      html
    };

    // Debugging test: Verify mail options
    console.log("Mail options:");
    console.log(mailOptions);

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.response);

  } catch (err) {
    console.error("Error sending email:", err);
  }
}