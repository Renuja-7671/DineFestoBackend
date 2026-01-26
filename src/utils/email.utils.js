const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} resetToken - Password reset token
 * @param {string} userName - User's name
 */
const sendPasswordResetEmail = async (email, resetToken, userName) => {
  try {
    const transporter = createTransporter();
    
    // Create reset URL - will work for both web and mobile
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: `"DineFesto RMS" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Password Reset Request - DineFesto RMS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <style>
            body {
              background-color: #f6f9fc;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              -webkit-font-smoothing: antialiased;
              font-size: 16px;
              line-height: 1.6;
              margin: 0;
              padding: 0;
            }
            .container {
              background-color: #ffffff;
              margin: 0 auto;
              max-width: 600px;
              padding: 40px 20px;
            }
            .header {
              text-align: center;
              padding-bottom: 30px;
              border-bottom: 2px solid #f0f0f0;
            }
            .logo {
              font-size: 32px;
              font-weight: 800;
              color: #6366f1;
              margin: 0;
              letter-spacing: -0.5px;
            }
            .content {
              padding: 30px 0;
            }
            .greeting {
              font-size: 18px;
              font-weight: 600;
              color: #1a1a1a;
              margin-bottom: 20px;
            }
            .message {
              color: #4a5568;
              margin-bottom: 30px;
              line-height: 1.8;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .reset-button {
              background-color: #6366f1;
              border-radius: 8px;
              color: #ffffff;
              display: inline-block;
              font-size: 16px;
              font-weight: 600;
              padding: 16px 40px;
              text-decoration: none;
              box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);
            }
            .reset-button:hover {
              background-color: #4f46e5;
            }
            .alternative-link {
              background-color: #f7fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 20px;
              margin: 30px 0;
              word-break: break-all;
            }
            .alternative-link-text {
              font-size: 14px;
              color: #718096;
              margin-bottom: 10px;
            }
            .link-text {
              color: #6366f1;
              font-size: 13px;
              word-wrap: break-word;
            }
            .warning {
              background-color: #fff5f5;
              border-left: 4px solid #fc8181;
              padding: 15px;
              margin: 20px 0;
              font-size: 14px;
              color: #742a2a;
            }
            .footer {
              border-top: 2px solid #f0f0f0;
              padding-top: 30px;
              text-align: center;
              color: #a0aec0;
              font-size: 14px;
            }
            .expiry-notice {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px;
              margin: 20px 0;
              font-size: 14px;
              color: #78350f;
            }
            .security-note {
              font-size: 13px;
              color: #718096;
              margin-top: 20px;
              padding: 15px;
              background-color: #f7fafc;
              border-radius: 6px;
            }
            @media only screen and (max-width: 600px) {
              .container {
                padding: 20px 15px;
              }
              .reset-button {
                display: block;
                width: 100%;
                padding: 14px 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 class="logo">🍽️ DineFesto</h1>
              <p style="color: #718096; margin-top: 10px;">Restaurant Management System</p>
            </div>
            
            <div class="content">
              <p class="greeting">Hello ${userName || 'User'},</p>
              
              <p class="message">
                We received a request to reset your password for your DineFesto RMS account. 
                If you made this request, click the button below to reset your password:
              </p>
              
              <div class="button-container">
                <a href="${resetUrl}" class="reset-button">Reset Your Password</a>
              </div>
              
              <div class="expiry-notice">
                ⏰ <strong>Important:</strong> This link will expire in 1 hour for security purposes.
              </div>
              
              <div class="alternative-link">
                <p class="alternative-link-text">
                  Or copy and paste this link into your browser:
                </p>
                <p class="link-text">${resetUrl}</p>
              </div>
              
              <div class="warning">
                <strong>⚠️ Didn't request this?</strong><br/>
                If you didn't request a password reset, please ignore this email or contact support if you're concerned about your account security. Your password will remain unchanged.
              </div>
              
              <div class="security-note">
                <strong>🔒 Security Tip:</strong> Never share your password reset link with anyone. 
                DineFesto staff will never ask for your password or reset link.
              </div>
            </div>
            
            <div class="footer">
              <p>
                <strong>DineFesto Restaurant Management System</strong><br/>
                This is an automated message, please do not reply to this email.
              </p>
              <p style="margin-top: 15px; font-size: 12px;">
                © ${new Date().getFullYear()} DineFesto. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      // Plain text version for email clients that don't support HTML
      text: `
Hello ${userName || 'User'},

We received a request to reset your password for your DineFesto RMS account.

To reset your password, please visit the following link:
${resetUrl}

This link will expire in 1 hour for security purposes.

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

For security reasons, never share your password reset link with anyone.

Best regards,
DineFesto Team

---
This is an automated message, please do not reply to this email.
© ${new Date().getFullYear()} DineFesto. All rights reserved.
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

/**
 * Send password reset confirmation email
 * @param {string} email - Recipient email
 * @param {string} userName - User's name
 */
const sendPasswordResetConfirmation = async (email, userName) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"DineFesto RMS" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Password Successfully Reset - DineFesto RMS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <style>
            body {
              background-color: #f6f9fc;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 16px;
              line-height: 1.6;
              margin: 0;
              padding: 0;
            }
            .container {
              background-color: #ffffff;
              margin: 0 auto;
              max-width: 600px;
              padding: 40px 20px;
            }
            .header {
              text-align: center;
              padding-bottom: 30px;
              border-bottom: 2px solid #f0f0f0;
            }
            .success-icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
            .content {
              padding: 30px 0;
            }
            .message {
              color: #4a5568;
              text-align: center;
              line-height: 1.8;
            }
            .footer {
              border-top: 2px solid #f0f0f0;
              padding-top: 30px;
              text-align: center;
              color: #a0aec0;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-icon">✅</div>
              <h1 style="color: #10b981; margin: 0;">Password Reset Successful</h1>
            </div>
            
            <div class="content">
              <p class="message">
                <strong>Hello ${userName || 'User'},</strong><br/><br/>
                Your password for DineFesto RMS has been successfully reset.<br/><br/>
                If you did not make this change, please contact support immediately.
              </p>
            </div>
            
            <div class="footer">
              <p><strong>DineFesto Restaurant Management System</strong></p>
              <p>© ${new Date().getFullYear()} DineFesto. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello ${userName || 'User'},

Your password for DineFesto RMS has been successfully reset.

If you did not make this change, please contact support immediately.

Best regards,
DineFesto Team
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset confirmation email sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset confirmation email:', error);
    // Don't throw error here, as password was already reset successfully
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendPasswordResetConfirmation,
};
