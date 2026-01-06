"""Email service for sending verification codes and notifications."""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

# Email configuration - these should be moved to settings
EMAIL_DEV_MODE = True  # Set to False in production
SENDER_EMAIL = "noreply@chatfold.com"
SENDER_NAME = "ChatFold"
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USERNAME = ""  # Set via environment variable
SMTP_PASSWORD = ""  # Set via environment variable


def send_verification_code(to_email: str, code: str) -> bool:
    """Send verification code email.

    Args:
        to_email: Recipient email address
        code: 6-digit verification code

    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Development mode: just log the code
        if EMAIL_DEV_MODE:
            logger.info("=" * 60)
            logger.info("VERIFICATION CODE (DEV MODE)")
            logger.info(f"To: {to_email}")
            logger.info(f"Code: {code}")
            logger.info("=" * 60)
            return True

        # Production mode: send actual email
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
        msg["To"] = to_email
        msg["Subject"] = f"Your ChatFold verification code: {code}"

        # HTML email body
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    text-align: center;
                    padding: 20px 0;
                    border-bottom: 2px solid #f0f0f0;
                }}
                .code-box {{
                    background: #f8f9fa;
                    border: 2px solid #e9ecef;
                    border-radius: 8px;
                    padding: 30px;
                    text-align: center;
                    margin: 30px 0;
                }}
                .code {{
                    font-size: 42px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    color: #FF8400;
                    font-family: 'Courier New', monospace;
                }}
                .warning {{
                    background: #fff3cd;
                    border-left: 4px solid #ffc107;
                    padding: 15px;
                    margin: 20px 0;
                }}
                .footer {{
                    text-align: center;
                    padding: 20px 0;
                    color: #666;
                    font-size: 14px;
                    border-top: 2px solid #f0f0f0;
                    margin-top: 30px;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>ChatFold</h1>
                <p>Protein Folding Workbench</p>
            </div>

            <h2>Your Verification Code</h2>
            <p>Please use the following verification code to complete your registration:</p>

            <div class="code-box">
                <div class="code">{code}</div>
            </div>

            <div class="warning">
                <strong>⚠️ Important:</strong>
                <ul style="margin: 10px 0;">
                    <li>This code will expire in <strong>5 minutes</strong></li>
                    <li>Do not share this code with anyone</li>
                    <li>ChatFold will never ask for this code via phone or email</li>
                </ul>
            </div>

            <p>If you didn't request this code, please ignore this email.</p>

            <div class="footer">
                <p>© 2025 ChatFold. All rights reserved.</p>
                <p>This is an automated email. Please do not reply.</p>
            </div>
        </body>
        </html>
        """

        # Plain text alternative
        text = f"""
        ChatFold - Protein Folding Workbench

        Your Verification Code
        =======================

        {code}

        This code will expire in 5 minutes.
        Do not share this code with anyone.

        If you didn't request this code, please ignore this email.

        © 2025 ChatFold. All rights reserved.
        """

        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        # Send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"Verification email sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send verification email to {to_email}: {e}")
        return False


def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """Send password reset email.

    Args:
        to_email: Recipient email address
        reset_link: Password reset link

    Returns:
        True if email sent successfully, False otherwise
    """
    # TODO: Implement password reset email
    logger.info(f"Password reset email would be sent to {to_email} with link: {reset_link}")
    return True
