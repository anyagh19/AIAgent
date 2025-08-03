import { config } from 'dotenv';
import axios from 'axios';
import nodemailer from 'nodemailer'; // <--- ADD THIS IMPORT

config();

const geminiApiKey = process.env.GEMINI_API_KEY;

export async function apiResponse({ from, to, sub }) {
  try {
    // Generate email body text using Gemini API
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Generate a short email body for a subject: "${sub}"`, // Prompt Gemini to generate the email body
            }
          ]
        }
      ]
    };

    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const aiText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No content generated.";

    // Nodemailer transport setup
    // Ensure nodemailer is installed: npm install nodemailer
    const nodemailerUser = process.env.NODEMAILER_USER;
    const nodemailerPass = process.env.NODEMAILER_PASS
    const transporter = nodemailer.createTransport({ // <--- Correct variable name
      host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: {
        user: nodemailerUser,
        pass: nodemailerPass
      }
    });

    try {
      await transporter.verify(); // <--- Correct variable name
      console.log("Transporter is ready to send emails");
    } catch (verifyError) {
      console.error("Error verifying transporter:", verifyError);
      return {
        error: true,
        message: `Email service not ready: ${verifyError.message}`,
      };
    }

    try {
      const info = await transporter.sendMail({ // <--- Correct variable name
        from,
        to,
        subject: sub,
        text: aiText,
        html: `<b>${aiText}</b>`,
      });

      console.log("Message sent: %s", info.messageId);
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));

      return {
        content: [
          {
            type: "text",
            text: `Email successfully sent to ${to} with subject "${sub}". Message ID: ${info.messageId}`
          }
        ]
      };
    } catch (sendError) {
      console.error("Error while sending mail:", sendError);
      return {
        error: true,
        message: `Failed to send email: ${sendError.message}`,
      };
    }

  } catch (error) {
    console.error("Overall API/Nodemailer error:", error?.response?.data || error.message);
    return {
      error: true,
      message: `An unexpected error occurred: ${error.message}`,
      details: error.response?.data
    };
  }
}
